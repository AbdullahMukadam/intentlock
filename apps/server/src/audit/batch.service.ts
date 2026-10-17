import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import {
  block,
  BlockReason,
  check,
  type ClientEntry,
  ClientEntryKind,
  type Decision,
  GENESIS,
  hashClientEntry,
  MAX_TTL_SECONDS,
  Verdict,
} from "@intentlock/core";

import type { AgentCaller } from "../common/types/auth.types.js";
import { isBlock } from "../common/utils/decision.util.js";
import { toJson } from "../common/utils/to-json.util.js";
import { KeysService } from "../keys/keys.service.js";
import type { VerifiedBundle } from "../keys/types/verified-bundle.type.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  findCheckedCall,
  recordRun,
  updateCompletion,
} from "../reports/utils/plan-progress.util.js";
import { AuditService } from "./audit.service.js";
import { PLAN_LOCK_NAMESPACE } from "./constants/audit.constants.js";
import type { AuditBatchDto } from "./dto/audit-batch.dto.js";
import { AuditError } from "./enums/audit-error.enum.js";
import { AuditFlag } from "./enums/audit-flag.enum.js";
import { AuditKind } from "./enums/audit-kind.enum.js";
import { AuditOrigin } from "./enums/audit-origin.enum.js";
import { BatchRejectReason } from "./enums/batch-reject-reason.enum.js";
import type { AuditInput } from "./types/audit-input.type.js";
import { decisionsAgree } from "./utils/decisions-agree.util.js";

type Rejected = { clientSeq: number; reason: BatchRejectReason };
type BatchPlan = { id: string; user: string };
type Prepared = {
  entry: ClientEntry;
  hashOk: boolean;
  verified: VerifiedBundle;
  expected?: Decision;
};
type CheckedCall = { step: number; tool: string | null };

const RUN_VERDICTS = new Set<string>([Verdict.ALLOW, Verdict.HOLD]);

@Injectable()
export class BatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
  ) {}

  async ingest(caller: AgentCaller, batch: AuditBatchDto) {
    const db = orgDb(this.prisma, caller.orgId);
    const plan = await db.plan.findFirst({ where: { id: batch.planId, agentId: caller.agentId } });
    if (!plan) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: AuditError.PLAN_NOT_FOUND,
      });
    }
    const entries: ClientEntry[] = batch.entries
      .map(({ tokenRef, ...e }) => ({ ...e, token: batch.tokens[tokenRef]! }))
      .sort((a, b) => a.clientSeq - b.clientSeq);
    const prepared = await Promise.all(entries.map((e) => this.prepare(caller, plan, e)));

    return db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${PLAN_LOCK_NAMESPACE}::int, hashtext(${plan.id}))`;
      const [head] = await tx.$queryRaw<{ clientSeq: number; clientHash: string }[]>`
        SELECT "clientSeq", "clientHash" FROM "AuditEntry"
        WHERE "orgId" = ${caller.orgId} AND "planId" = ${plan.id} AND "clientSeq" IS NOT NULL
        ORDER BY "clientSeq" DESC LIMIT 1`;
      let lastSeq = head?.clientSeq ?? 0;
      let lastHash = head?.clientHash ?? GENESIS;
      const rejected = await this.conflicts(
        tx,
        plan.id,
        entries.filter((e) => e.clientSeq <= lastSeq),
      );

      const out: AuditInput[] = [];
      const checkedInBatch = new Map<string, CheckedCall>();
      const reportedInBatch = new Set<string>();
      let storedChecks: number | null = null;
      for (const p of prepared) {
        const { entry } = p;
        if (entry.clientSeq <= lastSeq) continue;
        let chainOk = p.hashOk;
        if (entry.clientSeq !== lastSeq + 1) {
          out.push({
            kind: AuditKind.CLIENT_GAP,
            origin: AuditOrigin.CLIENT,
            actor: caller.agentId,
            agentId: caller.agentId,
            user: plan.user,
            planId: plan.id,
            flagged: AuditFlag.GAP,
            payload: { from: lastSeq + 1, to: entry.clientSeq - 1 },
          });
        } else if (entry.prevLocalHash !== lastHash) {
          chainOk = false;
        }

        if (entry.kind === ClientEntryKind.CHECK) {
          out.push(this.checkEntry(caller, plan, p, chainOk));
          const d = entry.decision;
          const step = d && "planStep" in d ? d.planStep : null;
          if (entry.call && d && RUN_VERDICTS.has(d.verdict) && typeof step === "number") {
            checkedInBatch.set(entry.call.callId, { step, tool: entry.call.tool });
          }
          if (storedChecks !== null) storedChecks++;
        } else {
          storedChecks ??= await this.countStoredChecks(tx, plan.id, out);
          out.push(
            await this.reportEntry(tx, caller, plan, p, chainOk, {
              checkedInBatch,
              reportedInBatch,
              storedChecks,
            }),
          );
        }
        lastSeq = entry.clientSeq;
        lastHash = entry.localHash;
      }
      await updateCompletion(tx, plan.id);
      if (out.length > 0) await this.audit.append(caller.orgId, out, tx);
      return { ackedThrough: lastSeq, rejected };
    });
  }

  private async prepare(
    caller: AgentCaller,
    plan: BatchPlan,
    entry: ClientEntry,
  ): Promise<Prepared> {
    const { localHash, ...body } = entry;
    const hashOk = (await hashClientEntry(body)) === localHash;
    const at = new Date(entry.clientAt);
    if (entry.kind !== ClientEntryKind.CHECK) {
      return {
        entry,
        hashOk,
        verified: await this.keys.verifyForAgent(entry.token, caller, at, MAX_TTL_SECONDS),
      };
    }
    const verified = await this.keys.verifyForAgent(entry.token, caller, at);
    const bundle = verified.ok && verified.bundle.jti === plan.id ? verified.bundle : null;
    const expected = entry.call
      ? bundle
        ? check(bundle, entry.call, entry.usage ?? [])
        : block(verified.ok ? BlockReason.INVALID_TOKEN : verified.reason)
      : undefined;
    return { entry, hashOk, verified, ...(expected && { expected }) };
  }

  private checkEntry(
    caller: AgentCaller,
    plan: BatchPlan,
    { entry, verified, expected }: Prepared,
    chainOk: boolean,
  ): AuditInput {
    const bundle = verified.ok && verified.bundle.jti === plan.id ? verified.bundle : null;
    let flagged: AuditFlag | null = chainOk ? null : AuditFlag.CHAIN_BREAK;
    if (!flagged) {
      if (!entry.call || !entry.decision || !expected) {
        flagged = AuditFlag.DECISION_MISMATCH;
      } else if (!decisionsAgree(entry.decision, expected)) {
        flagged = AuditFlag.DECISION_MISMATCH;
      }
    }
    const d = entry.decision;
    return {
      kind: AuditKind.CHECK,
      origin: AuditOrigin.CLIENT,
      actor: caller.agentId,
      agentId: caller.agentId,
      user: bundle?.sub ?? plan.user,
      planId: plan.id,
      tool: entry.call?.tool ?? null,
      verdict: d?.verdict ?? null,
      ruleId: d?.ruleId ?? null,
      policyVersion: bundle?.polv ?? null,
      clientSeq: entry.clientSeq,
      clientAt: new Date(entry.clientAt),
      clientHash: entry.localHash,
      flagged,
      payload: toJson({
        call: entry.call ?? null,
        inPlan: !(d && isBlock(d) && d.reason === BlockReason.NOT_IN_PLAN),
        decision: d ?? null,
        usage: entry.usage ?? null,
      }),
    };
  }

  private async reportEntry(
    tx: OrgTx,
    caller: AgentCaller,
    plan: BatchPlan,
    { entry, verified }: Prepared,
    chainOk: boolean,
    batch: {
      checkedInBatch: Map<string, CheckedCall>;
      reportedInBatch: Set<string>;
      storedChecks: number;
    },
  ): Promise<AuditInput> {
    const bundle = verified.ok && verified.bundle.jti === plan.id ? verified.bundle : null;
    const reportedBefore = entry.callId !== undefined && batch.reportedInBatch.has(entry.callId);
    if (entry.callId !== undefined) batch.reportedInBatch.add(entry.callId);
    let step: number | null = null;
    let tool: string | null = null;
    if (bundle && entry.callId && entry.outcome) {
      const checked =
        batch.checkedInBatch.get(entry.callId) ??
        (await findCheckedCall(tx, plan.id, entry.callId));
      if (checked) {
        step = checked.step;
        tool = checked.tool;
        if (!reportedBefore)
          await recordRun(tx, plan.id, entry.callId, checked.step, entry.outcome);
      }
    }
    let flagged: AuditFlag | null = chainOk ? null : AuditFlag.CHAIN_BREAK;
    if (!flagged && !bundle) flagged = AuditFlag.INVALID_TOKEN;
    if (!flagged && entry.decisionCount !== undefined && batch.storedChecks < entry.decisionCount) {
      flagged = AuditFlag.TRUNCATED;
    }
    return {
      kind: AuditKind.REPORT,
      origin: AuditOrigin.CLIENT,
      actor: caller.agentId,
      agentId: caller.agentId,
      user: bundle?.sub ?? plan.user,
      planId: plan.id,
      tool,
      policyVersion: bundle?.polv ?? null,
      clientSeq: entry.clientSeq,
      clientAt: new Date(entry.clientAt),
      clientHash: entry.localHash,
      flagged,
      payload: toJson({
        callId: entry.callId ?? null,
        outcome: entry.outcome ?? null,
        planStep: step,
        decisionCount: entry.decisionCount ?? null,
      }),
    };
  }

  private async countStoredChecks(tx: OrgTx, planId: string, pending: AuditInput[]) {
    const stored = await tx.auditEntry.count({
      where: { planId, kind: AuditKind.CHECK, origin: AuditOrigin.CLIENT },
    });
    return stored + pending.filter((e) => e.kind === AuditKind.CHECK).length;
  }

  private async conflicts(tx: OrgTx, planId: string, resent: ClientEntry[]): Promise<Rejected[]> {
    if (resent.length === 0) return [];
    const stored = await tx.auditEntry.findMany({
      where: { planId, clientSeq: { in: resent.map((e) => e.clientSeq) } },
      select: { clientSeq: true, clientHash: true },
    });
    const byS = new Map(stored.map((s) => [s.clientSeq, s.clientHash]));
    return resent
      .filter((e) => byS.has(e.clientSeq) && byS.get(e.clientSeq) !== e.localHash)
      .map((e) => ({ clientSeq: e.clientSeq, reason: BatchRejectReason.CONFLICTS_WITH_STORED }));
  }
}
