import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  HoldStatus as WireHoldStatus,
  type HoldWebhookEvent,
  signWebhook,
  WEBHOOK_EVENT_ID_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  WebhookEventType,
} from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import type { HoldStatus } from "../generated/prisma/client.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  MAX_WEBHOOK_ERROR_CHARS,
  WEBHOOK_BATCH,
  WEBHOOK_LEASE_SECONDS,
  WEBHOOK_POLL_MS,
  WEBHOOK_TIMEOUT_MS,
} from "./constants/hold.constants.js";
import { WebhookDeliveryOutcome } from "./enums/webhook-delivery-outcome.enum.js";
import { toHoldState } from "./utils/hold-state.util.js";
import { webhookRetryDelaySeconds } from "./utils/webhook-retry.util.js";

type ClaimedEvent = {
  id: string;
  orgId: string;
  agentId: string;
  holdId: string;
  planId: string;
  status: HoldStatus;
  attempts: number;
  createdAt: Date;
  webhookUrl: string | null;
  webhookSecret: string | null;
};

type Attempt = { ok: true } | { ok: false; error: string };

@Injectable()
export class HoldWebhooks implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LoggerContext.HOLD_WEBHOOKS);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.kick(), WEBHOOK_POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async enqueue(tx: OrgTx, orgId: string, holdIds: string[]): Promise<void> {
    if (holdIds.length === 0) return;
    await tx.$executeRaw`
      INSERT INTO "HoldEvent" (id, "orgId", "agentId", "holdId", "planId", status)
      SELECT gen_random_uuid()::text, h."orgId", h."agentId", h.id, h."planId", h.status
      FROM "Hold" h JOIN "Agent" a ON a.id = h."agentId" AND a."orgId" = h."orgId"
      WHERE h."orgId" = ${orgId} AND h.id = ANY(${holdIds}) AND a."webhookUrl" IS NOT NULL`;
  }

  kick(): void {
    this.deliverDue().catch((err: unknown) => this.log.error(err));
  }

  deliverDue(): Promise<number> {
    this.running ??= this.deliverAll().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async deliverAll(): Promise<number> {
    const orgs = await this.prisma.organization.findMany({ select: { id: true } });
    let total = 0;
    for (const { id } of orgs) {
      for (;;) {
        const claimed = await this.claim(id);
        await Promise.all(claimed.map((e) => this.deliver(e)));
        total += claimed.length;
        if (claimed.length < WEBHOOK_BATCH) break;
      }
    }
    return total;
  }

  private claim(orgId: string): Promise<ClaimedEvent[]> {
    return this.prisma.$queryRaw<ClaimedEvent[]>`
      WITH due AS (
        SELECT id FROM "HoldEvent"
        WHERE "orgId" = ${orgId} AND "deliveredAt" IS NULL AND "failedAt" IS NULL
          AND "nextAttemptAt" <= now()
        ORDER BY "nextAttemptAt"
        LIMIT ${WEBHOOK_BATCH}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "HoldEvent" e
      SET attempts = e.attempts + 1,
        "nextAttemptAt" = now() + make_interval(secs => ${WEBHOOK_LEASE_SECONDS})
      FROM due, "Agent" a
      WHERE e.id = due.id AND a.id = e."agentId" AND a."orgId" = e."orgId"
      RETURNING e.id, e."orgId", e."agentId", e."holdId", e."planId", e.status, e.attempts,
        e."createdAt", a."webhookUrl", a."webhookSecret"`;
  }

  private async deliver(event: ClaimedEvent): Promise<void> {
    const result = await this.post(event);
    const now = new Date();
    const retryIn =
      result.ok || !event.webhookUrl ? null : webhookRetryDelaySeconds(event.attempts);
    const outcome = result.ok
      ? WebhookDeliveryOutcome.DELIVERED
      : retryIn === null
        ? WebhookDeliveryOutcome.FAILED
        : WebhookDeliveryOutcome.RETRY;
    const error = result.ok ? null : result.error.slice(0, MAX_WEBHOOK_ERROR_CHARS);
    await orgDb(this.prisma, event.orgId).$transaction(async (tx) => {
      const { count } = await tx.holdEvent.updateMany({
        where: { id: event.id, attempts: event.attempts, deliveredAt: null, failedAt: null },
        data: {
          lastError: error,
          ...(outcome === WebhookDeliveryOutcome.DELIVERED && { deliveredAt: now }),
          ...(outcome === WebhookDeliveryOutcome.FAILED && { failedAt: now }),
          ...(retryIn !== null && { nextAttemptAt: new Date(now.getTime() + retryIn * 1000) }),
        },
      });
      if (count === 0) return;
      await this.audit.append(
        event.orgId,
        [
          {
            kind: AuditKind.HOLD_WEBHOOK,
            agentId: event.agentId,
            planId: event.planId,
            payload: {
              eventId: event.id,
              holdId: event.holdId,
              status: toHoldState(event.status),
              attempt: event.attempts,
              outcome,
              error,
            },
          },
        ],
        tx,
      );
    });
  }

  private async post(event: ClaimedEvent): Promise<Attempt> {
    if (!event.webhookUrl || !event.webhookSecret) {
      return { ok: false, error: "no webhook url set for the agent" };
    }
    const body: HoldWebhookEvent = {
      id: event.id,
      type: WebhookEventType.HOLD_RESOLVED,
      at: event.createdAt.toISOString(),
      holdId: event.holdId,
      planId: event.planId,
      agentId: event.agentId,
      status: WireHoldStatus[event.status],
    };
    const text = JSON.stringify(body);
    try {
      const res = await fetch(event.webhookUrl, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_EVENT_ID_HEADER]: event.id,
          [WEBHOOK_SIGNATURE_HEADER]: await signWebhook(event.webhookSecret, text, new Date()),
        },
        body: text,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      await res.body?.cancel();
      return res.ok ? { ok: true } : { ok: false, error: `answered ${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
