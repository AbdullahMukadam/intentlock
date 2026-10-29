import { HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { Plan as PlanSchema } from "@intentlock/core";

import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { emptyVerdictCounts, tallyVerdicts } from "../common/utils/verdict-counts.util.js";
import { type Prisma, PlanStatus } from "../generated/prisma/client.js";
import { toHoldView } from "../holds/utils/to-hold-view.util.js";
import { emailsById } from "../users/utils/emails-by-id.util.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { LicenseService } from "../license/license.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import type { ListRunsQueryDto } from "./dto/list-runs-query.dto.js";
import { RunError } from "./enums/run-error.enum.js";
import { RunStatus } from "./enums/run-status.enum.js";
import { RunEntryPayloadSchema } from "./schemas/run-entry-payload.schema.js";
import { runStatus } from "./utils/run-status.util.js";

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly license: LicenseService,
  ) {}

  async list(viewer: SessionUser, q: ListRunsQueryDto) {
    const db = orgDb(this.prisma, viewer.orgId);
    const now = new Date();
    const where: Prisma.PlanWhereInput = {
      createdAt: { gte: this.license.historyCutoff(now) },
      ...(q.agentId && { agentId: q.agentId }),
      ...this.ownerFilter(viewer, q.user),
      ...(q.cursor && { id: { lt: q.cursor } }),
      ...(q.status === RunStatus.COMPLETED && { status: PlanStatus.COMPLETED }),
      ...(q.status === RunStatus.ACTIVE && { status: PlanStatus.ACTIVE, expiresAt: { gt: now } }),
      ...(q.status === RunStatus.EXPIRED && {
        OR: [
          { status: PlanStatus.EXPIRED },
          { status: PlanStatus.ACTIVE, expiresAt: { lte: now } },
        ],
      }),
    };
    const rows = await db.plan.findMany({ where, orderBy: { id: "desc" }, take: q.limit + 1 });
    const page = rows.slice(0, q.limit);
    const ids = page.map((p) => p.id);
    const [agents, verdicts] = await Promise.all([
      db.agent.findMany({ where: { id: { in: [...new Set(page.map((p) => p.agentId))] } } }),
      db.auditEntry.groupBy({
        by: ["planId", "verdict"],
        where: { kind: AuditKind.CHECK, planId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const names = new Map(agents.map((a) => [a.id, a.name]));
    const counts = tallyVerdicts(verdicts, (r) => r.planId);
    return {
      runs: page.map((p) => ({
        planId: p.id,
        agentId: p.agentId,
        agentName: names.get(p.agentId) ?? null,
        user: p.user,
        goal: p.goal,
        status: runStatus(p, now),
        policyVersion: p.policyVersion,
        createdAt: p.createdAt,
        expiresAt: p.expiresAt,
        counts: counts.get(p.id) ?? emptyVerdictCounts(),
      })),
      nextCursor: rows.length > q.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async get(viewer: SessionUser, planId: string) {
    const db = orgDb(this.prisma, viewer.orgId);
    const plan = await db.plan.findFirst({
      where: {
        id: planId,
        createdAt: { gte: this.license.historyCutoff() },
        ...this.ownerFilter(viewer),
      },
    });
    if (!plan) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: RunError.RUN_NOT_FOUND,
      });
    }
    const [agent, entries, holds] = await Promise.all([
      db.agent.findFirst({ where: { id: plan.agentId } }),
      db.auditEntry.findMany({ where: { planId }, orderBy: { seq: "asc" } }),
      db.hold.findMany({ where: { planId }, orderBy: { createdAt: "asc" } }),
    ]);
    const emails = await emailsById(
      db,
      holds.map((h) => h.resolvedBy),
    );
    const parsed = entries.map((e) => ({ e, p: RunEntryPayloadSchema.safeParse(e.payload).data }));
    const decisions = parsed
      .filter(({ e }) => e.kind === AuditKind.CHECK)
      .map(({ e, p }) => ({
        seq: e.seq,
        at: e.at,
        origin: e.origin,
        tool: e.tool,
        args: p?.call?.args ?? null,
        callId: p?.call?.callId ?? null,
        verdict: e.verdict,
        ruleId: e.ruleId,
        reason: p?.decision?.reason ?? null,
        holdId: p?.decision?.holdId ?? null,
        policyVersion: e.policyVersion,
        flagged: e.flagged,
      }));
    const reports = parsed
      .filter(({ e }) => e.kind === AuditKind.REPORT)
      .map(({ e, p }) => ({
        seq: e.seq,
        at: e.at,
        callId: p?.callId ?? null,
        outcome: p?.outcome ?? null,
      }));
    const first = decisions.at(0)?.at ?? null;
    const last = decisions.at(-1)?.at ?? null;
    return {
      plan: {
        id: plan.id,
        goal: plan.goal,
        user: plan.user,
        status: runStatus(plan),
        policyVersion: plan.policyVersion,
        planHash: plan.planHash,
        steps: PlanSchema.safeParse(plan.body).data?.steps ?? [],
        createdAt: plan.createdAt,
        expiresAt: plan.expiresAt,
      },
      agent: agent ? { id: agent.id, name: agent.name } : null,
      decisions,
      holds: holds.map((h) => toHoldView(h, emails)),
      reports,
      timing: {
        firstDecisionAt: first,
        lastDecisionAt: last,
        durationMs: first && last ? last.getTime() - first.getTime() : null,
      },
    };
  }

  // Members only see their own runs, whatever user filter they send (ARCHITECTURE §5.6).
  private ownerFilter(viewer: SessionUser, requested?: string): Prisma.PlanWhereInput {
    const user = viewer.role === UserRole.MEMBER ? viewer.email : requested;
    return user ? { user } : {};
  }
}
