import { BadRequestException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { MAX_TTL_SECONDS, type ReportOutcome } from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { KeysService } from "../keys/keys.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReportError } from "./enums/report-error.enum.js";
import { findCheckedCall, recordRun, updateCompletion } from "./utils/plan-progress.util.js";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
  ) {}

  // ponytail: idempotency is a read-then-write, so two simultaneous reports for one callId can both count; add a unique key if clients start retrying in parallel.
  async report(caller: AgentCaller, token: string, callId: string, outcome: ReportOutcome) {
    const verified = await this.keys.verifyForAgent(token, caller, new Date(), MAX_TTL_SECONDS);
    if (!verified.ok) {
      throw new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, error: verified.reason });
    }
    const planId = verified.bundle.jti;
    return orgDb(this.prisma, caller.orgId).$transaction(async (tx) => {
      const checked = await findCheckedCall(tx, planId, callId);
      if (!checked) {
        throw new NotFoundException({
          statusCode: HttpStatus.NOT_FOUND,
          error: ReportError.CALL_NOT_FOUND,
        });
      }
      if (await recordRun(tx, planId, callId, checked.step, outcome)) {
        await this.audit.append(
          caller.orgId,
          [
            {
              kind: AuditKind.REPORT,
              actor: caller.agentId,
              agentId: caller.agentId,
              user: verified.bundle.sub,
              planId,
              tool: checked.tool,
              policyVersion: verified.bundle.polv,
              payload: { callId, outcome, planStep: checked.step },
            },
          ],
          tx,
        );
      }
      return { planStatus: await updateCompletion(tx, planId) };
    });
  }
}
