import { Injectable } from "@nestjs/common";
import {
  block,
  BlockReason,
  type BundleClaims,
  check,
  type Decision,
  type GateDecision,
  ToolCall,
} from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { isBlock, isHold } from "../common/utils/decision.util.js";
import { EventName } from "../events/enums/event-name.enum.js";
import { EventsService } from "../events/events.service.js";
import type { Hold } from "../generated/prisma/client.js";
import { HoldsService } from "../holds/holds.service.js";
import { KeysService } from "../keys/keys.service.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { toCheckAudit } from "./utils/to-check-audit.util.js";

@Injectable()
export class CheckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
    private readonly holds: HoldsService,
    private readonly events: EventsService,
  ) {}

  // Remote mode (ARCHITECTURE §4): counter, hold and audit entry commit together or not at all.
  async check(caller: AgentCaller, token: string, rawCall: unknown): Promise<GateDecision> {
    const now = new Date();
    const db = orgDb(this.prisma, caller.orgId);
    const parsed = ToolCall.safeParse(rawCall);
    const call = parsed.success ? parsed.data : null;
    let bundle: BundleClaims | null = null;
    let decision: Decision;
    if (!call) {
      decision = block(BlockReason.INVALID_CALL);
    } else {
      const verified = await this.keys.verifyForAgent(token, caller, now);
      if (verified.ok) {
        bundle = verified.bundle;
        decision = await this.decide(db, bundle, call);
      } else {
        decision = block(verified.reason);
      }
    }

    let created: Hold | null = null;
    const result = await db.$transaction(async (tx) => {
      let final: Decision = decision;
      if (
        bundle &&
        !isBlock(final) &&
        !(await this.reserve(tx, caller.orgId, bundle, final.planStep))
      ) {
        final = block(BlockReason.CALL_LIMIT);
      }
      let result: GateDecision = final as GateDecision;
      if (bundle && call && isHold(final)) {
        const hold = (created = await this.holds.createIn(tx, {
          orgId: caller.orgId,
          agentId: caller.agentId,
          planId: bundle.jti,
          user: bundle.sub,
          call,
          decision: final,
          now,
        }));
        result = { ...final, holdId: hold.id };
      }
      await this.audit.append(caller.orgId, [toCheckAudit(caller, bundle, call, result)], tx);
      return result;
    });
    this.events.publish(
      EventName.DECISION,
      {
        planId: bundle?.jti ?? null,
        agentId: caller.agentId,
        user: bundle?.sub ?? null,
        tool: call?.tool ?? null,
        verdict: result.verdict,
        ruleId: result.ruleId,
      },
      { orgId: caller.orgId, user: bundle?.sub ?? null },
    );
    if (created) this.holds.announceCreated(created);
    return result;
  }

  private async decide(db: ReturnType<typeof orgDb>, bundle: BundleClaims, call: ToolCall) {
    const rows = await db.stepUsage.findMany({ where: { planId: bundle.jti } });
    if (rows.length === 0) return block(BlockReason.INVALID_TOKEN);
    const usage: number[] = [];
    for (const row of rows) usage[row.step] = row.calls;
    return check(bundle, call, usage);
  }

  // DEPLOYMENT §5.1: never read-modify-write; zero rows means another call took the last slot.
  private async reserve(tx: OrgTx, orgId: string, bundle: BundleClaims, step: number) {
    const maxCalls = bundle.plan.steps[step]?.maxCalls ?? 0;
    const rows = await tx.$queryRaw<{ calls: number }[]>`
      UPDATE "StepUsage" SET calls = calls + 1
      WHERE "orgId" = ${orgId} AND "planId" = ${bundle.jti} AND step = ${step} AND calls < ${maxCalls}
      RETURNING calls`;
    return rows.length === 1;
  }
}
