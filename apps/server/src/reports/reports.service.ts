import { BadRequestException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { MAX_TTL_SECONDS, Plan } from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../audit/enums/audit-verdict.enum.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { PlanStatus } from "../generated/prisma/client.js";
import { KeysService } from "../keys/keys.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ReportError } from "./enums/report-error.enum.js";
import { ReportOutcome } from "./enums/report-outcome.enum.js";
import { CheckedCallSchema } from "./schemas/checked-call.schema.js";

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
      const checked = await tx.auditEntry.findFirst({
        where: {
          planId,
          kind: AuditKind.CHECK,
          verdict: { in: [AuditVerdict.ALLOW, AuditVerdict.HOLD] },
          payload: { path: ["call", "callId"], equals: callId },
        },
        orderBy: { seq: "desc" },
      });
      const parsed = CheckedCallSchema.safeParse(checked?.payload);
      if (!checked || !parsed.success) {
        throw new NotFoundException({
          statusCode: HttpStatus.NOT_FOUND,
          error: ReportError.CALL_NOT_FOUND,
        });
      }
      const step = parsed.data.decision.planStep;
      const already = await tx.auditEntry.findFirst({
        where: { planId, kind: AuditKind.REPORT, payload: { path: ["callId"], equals: callId } },
      });
      if (!already) {
        if (outcome === ReportOutcome.OK) {
          await tx.stepUsage.updateMany({
            where: { planId, step },
            data: { ran: { increment: 1 } },
          });
        }
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
              payload: { callId, outcome, planStep: step },
            },
          ],
          tx,
        );
      }
      const plan = await tx.plan.findFirstOrThrow({ where: { id: planId } });
      const required = Plan.parse(plan.body)
        .steps.map((s, i) => (s.required ? i : -1))
        .filter((i) => i >= 0);
      if (plan.status === PlanStatus.ACTIVE && required.length > 0) {
        const done = await tx.stepUsage.count({
          where: { planId, step: { in: required }, ran: { gt: 0 } },
        });
        if (done === required.length) {
          await tx.plan.updateMany({
            where: { id: planId, status: PlanStatus.ACTIVE },
            data: { status: PlanStatus.COMPLETED },
          });
          return { planStatus: PlanStatus.COMPLETED.toLowerCase() };
        }
      }
      return { planStatus: plan.status.toLowerCase() };
    });
  }
}
