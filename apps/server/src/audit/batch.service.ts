import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import {
  block,
  BlockReason,
  check,
  type ClientEntry,
  ClientEntryKind,
  GENESIS,
  hashClientEntry,
  MAX_TTL_SECONDS,
} from "@intentlock/core";

import type { AgentCaller } from "../common/types/auth.types.js";
import { isBlock } from "../common/utils/decision.util.js";
import { toJson } from "../common/utils/to-json.util.js";
import { KeysService } from "../keys/keys.service.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  findCheckedCall,
  recordRun,
  updateCompletion,
} from "../reports/utils/plan-progress.util.js";
import { AuditService } from "./audit.service.js";
import type { AuditBatchDto } from "./dto/audit-batch.dto.js";
import { AuditError } from "./enums/audit-error.enum.js";
import { AuditFlag } from "./enums/audit-flag.enum.js";
import { AuditKind } from "./enums/audit-kind.enum.js";
import { AuditOrigin } from "./enums/audit-origin.enum.js";
import { BatchRejectReason } from "./enums/batch-reject-reason.enum.js";
import type { AuditInput } from "./types/audit-input.type.js";
import { decisionsAgree } from "./utils/decisions-agree.util.js";

type Rejected = { clientSeq: number; reason: BatchRejectReason };

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

    return db.$transaction(async (tx) => {
      await this.audit.lock(tx);
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

      for (const entry of entries) {
        if (entry.clientSeq <= lastSeq) continue;
        const out: AuditInput[] = [];
        let chainOk = true;
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
        const { localHash, ...body } = entry;
        if ((await hashClientEntry(body)) !== localHash) chainOk = false;

        out.push(
          entry.kind === ClientEntryKind.CHECK
            ? await this.checkEntry(caller, plan, entry, chainOk)
            : await this.reportEntry(tx, caller, plan, entry, chainOk),
        );
        await this.audit.append(caller.orgId, out, tx);
        lastSeq = entry.clientSeq;
        lastHash = localHash;
      }
      await updateCompletion(tx, plan.id);
      return { ackedThrough: lastSeq, rejected };
    });
  }

  private async checkEntry(
    caller: AgentCaller,
    plan: { id: string; user: string },
    entry: ClientEntry,
    chainOk: boolean,
  ): Promise<AuditInput> {
    const verified = await this.keys.verifyForAgent(entry.token, caller, new Date(entry.clientAt));
    const bundle = verified.ok && verified.bundle.jti === plan.id ? verified.bundle : null;
    let flagged: AuditFlag | null = chainOk ? null : AuditFlag.CHAIN_BREAK;
    if (!flagged) {
      if (!entry.call || !entry.decision) {
        flagged = AuditFlag.DECISION_MISMATCH;
      } else {
        const expected = bundle
          ? check(bundle, entry.call, entry.usage ?? [])
          : block(verified.ok ? BlockReason.INVALID_TOKEN : verified.reason);
        if (!decisionsAgree(entry.decision, expected)) flagged = AuditFlag.DECISION_MISMATCH;
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
    plan: { id: string; user: string },
    entry: ClientEntry,
    chainOk: boolean,
  ): Promise<AuditInput> {
    const verified = await this.keys.verifyForAgent(
      entry.token,
      caller,
      new Date(entry.clientAt),
      MAX_TTL_SECONDS,
    );
    const bundle = verified.ok && verified.bundle.jti === plan.id ? verified.bundle : null;
    let step: number | null = null;
    let tool: string | null = null;
    if (bundle && entry.callId && entry.outcome) {
      const checked = await findCheckedCall(tx, plan.id, entry.callId);
      if (checked) {
        step = checked.step;
        tool = checked.tool;
        await recordRun(tx, plan.id, entry.callId, checked.step, entry.outcome);
      }
    }
    let flagged: AuditFlag | null = chainOk ? null : AuditFlag.CHAIN_BREAK;
    if (!flagged && !bundle) flagged = AuditFlag.INVALID_TOKEN;
    if (!flagged && entry.decisionCount !== undefined) {
      const stored = await tx.auditEntry.count({
        where: { planId: plan.id, kind: AuditKind.CHECK, origin: AuditOrigin.CLIENT },
      });
      if (stored < entry.decisionCount) flagged = AuditFlag.TRUNCATED;
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
