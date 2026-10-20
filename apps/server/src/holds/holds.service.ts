import { setTimeout as sleep } from "node:timers/promises";

import {
  type BeforeApplicationShutdown,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from "@nestjs/common";
import {
  ApproverSpec,
  canApprove,
  check,
  HoldResolveOutcome,
  type ToolCall,
} from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../audit/enums/audit-verdict.enum.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { EventName } from "../events/enums/event-name.enum.js";
import { EventsService } from "../events/events.service.js";
import type { AgentCaller, SessionUser } from "../common/types/auth.types.js";
import { isHold } from "../common/utils/decision.util.js";
import { toJson } from "../common/utils/to-json.util.js";
import { type Hold, HoldStatus } from "../generated/prisma/client.js";
import { KeysService } from "../keys/keys.service.js";
import { HoldNotifier } from "./hold-notifier.service.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { EXPIRY_INTERVAL_MS, MAX_LISTED_HOLDS, WAIT_POLL_MS } from "./constants/hold.constants.js";
import { HoldError } from "./enums/hold-error.enum.js";
import type { HoldState } from "./enums/hold-state.enum.js";
import type { NewHold } from "./types/new-hold.type.js";
import { toHoldState, toHoldStatus } from "./utils/hold-state.util.js";
import { emailsById } from "../users/utils/emails-by-id.util.js";
import { toHoldView } from "./utils/to-hold-view.util.js";

type ClosedHoldRow = Pick<
  Hold,
  "id" | "planId" | "agentId" | "user" | "tool" | "ruleId" | "approvers"
>;

@Injectable()
export class HoldsService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly log = new Logger(LoggerContext.HOLDS);
  private readonly shutdown = new AbortController();
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly keys: KeysService,
    private readonly events: EventsService,
    private readonly notifier: HoldNotifier,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      this.expireAll().catch((err: unknown) => this.log.error(err));
    }, EXPIRY_INTERVAL_MS);
    this.timer.unref();
  }

  // Long-polls return their current status right away so shutdown is not held up.
  beforeApplicationShutdown() {
    clearInterval(this.timer);
    this.shutdown.abort();
  }

  createIn(tx: OrgTx, input: NewHold) {
    const { decision, call } = input;
    return tx.hold.create({
      data: {
        orgId: input.orgId,
        agentId: input.agentId,
        planId: input.planId,
        user: input.user,
        callId: call.callId,
        tool: call.tool,
        args: toJson(call.args),
        ruleId: decision.ruleId,
        approvers: toJson(decision.approvers),
        expiresAt: new Date(input.now.getTime() + decision.timeoutSeconds * 1000),
      },
    });
  }

  // Hybrid mode: the client decided "hold" locally; the server agrees before creating anything.
  async createForAgent(caller: AgentCaller, token: string, call: ToolCall, ruleId: string) {
    const now = new Date();
    const verified = await this.keys.verifyForAgent(token, caller, now);
    if (!verified.ok) {
      throw new BadRequestException({ statusCode: HttpStatus.BAD_REQUEST, error: verified.reason });
    }
    const { bundle } = verified;
    const db = orgDb(this.prisma, caller.orgId);
    const plan = await db.plan.findFirst({ where: { id: bundle.jti, agentId: caller.agentId } });
    if (!plan) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: HoldError.PLAN_NOT_FOUND,
      });
    }
    const decision = check(bundle, call, []);
    if (!isHold(decision) || decision.ruleId !== ruleId) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        error: HoldError.HOLD_NOT_JUSTIFIED,
        decision,
      });
    }
    const hold = await db.$transaction((tx) =>
      this.createIn(tx, {
        orgId: caller.orgId,
        agentId: caller.agentId,
        planId: bundle.jti,
        user: bundle.sub,
        call,
        decision,
        now,
      }),
    );
    this.announceCreated(hold);
    return {
      holdId: hold.id,
      approvers: decision.approvers,
      timeoutSeconds: decision.timeoutSeconds,
    };
  }

  async wait(
    caller: AgentCaller,
    holdId: string,
    timeoutSeconds: number,
  ): Promise<{ status: HoldState }> {
    const db = orgDb(this.prisma, caller.orgId);
    const deadline = Date.now() + timeoutSeconds * 1000;
    for (;;) {
      const hold = await db.hold.findFirst({ where: { id: holdId, agentId: caller.agentId } });
      if (!hold) throw holdNotFound();
      if (hold.status === HoldStatus.PENDING && hold.expiresAt.getTime() <= Date.now()) {
        await this.expireDue(caller.orgId);
        continue;
      }
      const remaining = deadline - Date.now();
      if (hold.status !== HoldStatus.PENDING || remaining <= 0 || this.shutdown.signal.aborted) {
        return { status: toHoldState(hold.status) };
      }
      await sleep(Math.min(WAIT_POLL_MS, remaining), undefined, {
        signal: this.shutdown.signal,
      }).catch(() => undefined);
    }
  }

  // Admins and approvers see every hold; members see their own and any they may approve.
  async list(user: SessionUser, state?: HoldState) {
    const rows = await orgDb(this.prisma, user.orgId).hold.findMany({
      where: state ? { status: toHoldStatus(state) } : {},
      orderBy: { createdAt: "desc" },
      take: MAX_LISTED_HOLDS,
    });
    const emails = await emailsById(
      orgDb(this.prisma, user.orgId),
      rows.map((h) => h.resolvedBy),
    );
    return rows
      .map((h) => ({ ...toHoldView(h, emails), canApprove: this.mayApprove(user, h) }))
      .filter((h) => user.role !== UserRole.MEMBER || h.user === user.email || h.canApprove);
  }

  async resolve(user: SessionUser, holdId: string, approve: boolean, note: string | undefined) {
    const db = orgDb(this.prisma, user.orgId);
    const hold = await db.hold.findFirst({ where: { id: holdId } });
    if (!hold) throw holdNotFound();
    if (!this.mayApprove(user, hold)) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        error: HoldError.NOT_AN_APPROVER,
      });
    }
    const now = new Date();
    const status = approve ? HoldStatus.APPROVED : HoldStatus.REJECTED;
    const resolved = await db.$transaction(async (tx) => {
      const { count } = await tx.hold.updateMany({
        where: { id: holdId, status: HoldStatus.PENDING, expiresAt: { gt: now } },
        data: { status, resolvedBy: user.id, note: note ?? null, resolvedAt: now },
      });
      if (count === 0) {
        const current = await tx.hold.findFirst({ where: { id: holdId } });
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: HoldError.HOLD_NOT_PENDING,
          status: current ? toHoldState(current.status) : null,
        });
      }
      await this.audit.append(
        user.orgId,
        [
          {
            kind: AuditKind.HOLD_RESOLVED,
            actor: user.id,
            user: hold.user,
            planId: hold.planId,
            agentId: hold.agentId,
            tool: hold.tool,
            verdict: approve ? AuditVerdict.APPROVED : AuditVerdict.REJECTED,
            ruleId: hold.ruleId,
            payload: { holdId, note: note ?? null, approver: user.email },
          },
        ],
        tx,
      );
      return tx.hold.findFirstOrThrow({ where: { id: holdId } });
    });
    this.announceResolved(resolved);
    return toHoldView(resolved, new Map([[user.id, user.email]]));
  }

  async resolveMany(user: SessionUser, ids: string[], approve: boolean, note: string | undefined) {
    const now = new Date();
    const status = approve ? HoldStatus.APPROVED : HoldStatus.REJECTED;
    const found = new Map(
      (await orgDb(this.prisma, user.orgId).hold.findMany({ where: { id: { in: ids } } })).map(
        (h) => [h.id, h],
      ),
    );
    const allowed = ids.filter((id) => {
      const hold = found.get(id);
      return hold !== undefined && this.mayApprove(user, hold);
    });
    const updated = allowed.length
      ? await orgDb(this.prisma, user.orgId).$transaction(async (tx) => {
          const rows = await tx.$queryRaw<ClosedHoldRow[]>`
            UPDATE "Hold" SET status = ${status}::"HoldStatus", "resolvedBy" = ${user.id},
              note = ${note ?? null}, "resolvedAt" = ${now}
            WHERE "orgId" = ${user.orgId} AND id = ANY(${allowed})
              AND status = ${HoldStatus.PENDING}::"HoldStatus" AND "expiresAt" > ${now}
            RETURNING id, "planId", "agentId", "user", tool, "ruleId", approvers`;
          if (rows.length > 0) {
            await this.audit.append(
              user.orgId,
              rows.map((h) => ({
                kind: AuditKind.HOLD_RESOLVED,
                actor: user.id,
                user: h.user,
                planId: h.planId,
                agentId: h.agentId,
                tool: h.tool,
                verdict: approve ? AuditVerdict.APPROVED : AuditVerdict.REJECTED,
                ruleId: h.ruleId,
                payload: { holdId: h.id, note: note ?? null, approver: user.email },
              })),
              tx,
            );
          }
          return rows;
        })
      : [];
    for (const row of updated) this.announceResolved({ ...row, orgId: user.orgId, status });

    const done = new Set(updated.map((h) => h.id));
    const mayResolve = new Set(allowed);
    const results = ids.map((id) => ({
      id,
      outcome: bulkOutcome(found.get(id), done.has(id), mayResolve.has(id), approve),
    }));
    return { results, resolved: done.size, skipped: ids.length - done.size };
  }

  async expireAll(): Promise<number> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    let total = 0;
    for (const { id } of orgs) total += await this.expireDue(id);
    return total;
  }

  // Idempotent across instances: a hold leaves PENDING once, and only returned rows are audited.
  async expireDue(orgId: string): Promise<number> {
    return orgDb(this.prisma, orgId)
      .$transaction(async (tx) => {
        const rows = await tx.$queryRaw<ClosedHoldRow[]>`
        UPDATE "Hold" SET status = ${HoldStatus.EXPIRED}::"HoldStatus", "resolvedAt" = now()
        WHERE "orgId" = ${orgId} AND status = ${HoldStatus.PENDING}::"HoldStatus" AND "expiresAt" <= now()
        RETURNING id, "planId", "agentId", "user", tool, "ruleId", approvers`;
        if (rows.length > 0) {
          await this.audit.append(
            orgId,
            rows.map((h) => ({
              kind: AuditKind.HOLD_RESOLVED,
              user: h.user,
              planId: h.planId,
              agentId: h.agentId,
              tool: h.tool,
              verdict: AuditVerdict.EXPIRED,
              ruleId: h.ruleId,
              payload: { holdId: h.id },
            })),
            tx,
          );
        }
        return rows;
      })
      .then((rows) => {
        for (const row of rows)
          this.announceResolved({ ...row, orgId, status: HoldStatus.EXPIRED });
        return rows.length;
      });
  }

  async rejectPendingForAgent(tx: OrgTx, admin: SessionUser, agentId: string, note: string) {
    const rows = await tx.$queryRaw<ClosedHoldRow[]>`
      UPDATE "Hold" SET status = ${HoldStatus.REJECTED}::"HoldStatus", "resolvedBy" = ${admin.id},
        note = ${note}, "resolvedAt" = now()
      WHERE "orgId" = ${admin.orgId} AND "agentId" = ${agentId} AND status = ${HoldStatus.PENDING}::"HoldStatus"
      RETURNING id, "planId", "agentId", "user", tool, "ruleId", approvers`;
    if (rows.length > 0) {
      await this.audit.append(
        admin.orgId,
        rows.map((h) => ({
          kind: AuditKind.HOLD_RESOLVED,
          actor: admin.id,
          user: h.user,
          planId: h.planId,
          agentId: h.agentId,
          tool: h.tool,
          verdict: AuditVerdict.REJECTED,
          ruleId: h.ruleId,
          payload: { holdId: h.id, note, approver: admin.email },
        })),
        tx,
      );
    }
    return () => {
      for (const row of rows)
        this.announceResolved({ ...row, orgId: admin.orgId, status: HoldStatus.REJECTED });
    };
  }

  announceCreated(hold: Hold) {
    this.events.publish(
      EventName.HOLD_CREATED,
      {
        holdId: hold.id,
        planId: hold.planId,
        agentId: hold.agentId,
        tool: hold.tool,
        user: hold.user,
        ruleId: hold.ruleId,
      },
      { orgId: hold.orgId, user: hold.user, approvers: this.spec(hold.approvers) },
    );
    this.notifier.notify(hold);
  }

  private announceResolved(hold: Pick<Hold, "id" | "orgId" | "user" | "status" | "approvers">) {
    this.events.publish(
      EventName.HOLD_RESOLVED,
      { holdId: hold.id, status: toHoldState(hold.status) },
      { orgId: hold.orgId, user: hold.user, approvers: this.spec(hold.approvers) },
    );
  }

  private spec(approvers: unknown) {
    const parsed = ApproverSpec.safeParse(approvers);
    return parsed.success ? parsed.data : undefined;
  }

  private mayApprove(user: SessionUser, hold: Hold): boolean {
    const spec = ApproverSpec.safeParse(hold.approvers);
    return spec.success && canApprove(spec.data, { email: user.email, role: user.role }, hold.user);
  }
}

function holdNotFound() {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    error: HoldError.HOLD_NOT_FOUND,
  });
}

function bulkOutcome(
  hold: Hold | undefined,
  resolved: boolean,
  allowed: boolean,
  approve: boolean,
): HoldResolveOutcome {
  if (resolved) return approve ? HoldResolveOutcome.APPROVED : HoldResolveOutcome.REJECTED;
  if (!hold) return HoldResolveOutcome.NOT_FOUND;
  if (!allowed) return HoldResolveOutcome.NOT_AN_APPROVER;
  return hold.status === HoldStatus.PENDING || hold.status === HoldStatus.EXPIRED
    ? HoldResolveOutcome.EXPIRED
    : HoldResolveOutcome.NOT_PENDING;
}
