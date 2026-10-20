import { Inject, Injectable, Logger } from "@nestjs/common";
import { ApproverSpec, canApprove } from "@intentlock/core";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { ENV, type Env } from "../config/config.module.js";
import type { Hold } from "../generated/prisma/client.js";
import { MailService } from "../mail/mail.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { NOTIFY_RETRY_MS, WEBHOOK_TIMEOUT_MS } from "./constants/hold.constants.js";
import { NotifyChannel } from "./enums/notify-channel.enum.js";
import { holdMessage, type HoldMessageInput, holdSubject } from "./utils/hold-message.util.js";

type Failure = { channel: NotifyChannel; to: string | null };

@Injectable()
export class HoldNotifier {
  private readonly log = new Logger(LoggerContext.HOLDS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  notify(hold: Hold): void {
    this.send(hold).catch((e: unknown) => this.log.error(e));
  }

  async send(hold: Hold): Promise<void> {
    const webhook = this.env.HOLD_WEBHOOK_URL;
    if (!this.mail.enabled && !webhook) return;
    const db = orgDb(this.prisma, hold.orgId);
    const agent = await db.agent.findFirst({ where: { id: hold.agentId }, select: { name: true } });
    const message: HoldMessageInput = {
      ...hold,
      agent: agent?.name ?? hold.agentId,
      link: `${this.env.PUBLIC_URL}/holds`,
    };
    const recipients = this.mail.enabled ? await this.recipients(hold) : [];
    const failures: Failure[] = [];
    const subject = holdSubject(message);
    const text = holdMessage(message, true);
    await Promise.all([
      ...recipients.map(async (to) => {
        if (!(await retryOnce(() => this.mail.send(to, subject, text)))) {
          failures.push({ channel: NotifyChannel.EMAIL, to });
        }
      }),
      (async () => {
        if (!webhook) return;
        const body = `${subject}\n${holdMessage(message, false)}`;
        if (!(await retryOnce(() => this.post(webhook, body)))) {
          failures.push({ channel: NotifyChannel.WEBHOOK, to: null });
        }
      })(),
    ]);
    if (failures.length === 0) return;
    await this.audit.append(
      hold.orgId,
      failures.map((f) => ({
        kind: AuditKind.HOLD_NOTIFY_FAILED,
        user: hold.user,
        planId: hold.planId,
        agentId: hold.agentId,
        tool: hold.tool,
        ruleId: hold.ruleId,
        payload: { holdId: hold.id, channel: f.channel, to: f.to },
      })),
    );
  }

  private async recipients(hold: Hold): Promise<string[]> {
    const spec = ApproverSpec.safeParse(hold.approvers);
    if (!spec.success) return [];
    const users = await orgDb(this.prisma, hold.orgId).user.findMany({
      where: { disabledAt: null, holdEmails: true },
      select: { email: true, role: true },
    });
    return users.filter((u) => canApprove(spec.data, u, hold.user)).map((u) => u.email);
  }

  private async post(url: string, text: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });
      if (res.ok) return true;
      this.log.warn(`Hold webhook answered ${res.status}`);
    } catch (e) {
      this.log.warn(`Hold webhook failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    return false;
  }
}

async function retryOnce(send: () => Promise<boolean>): Promise<boolean> {
  if (await send()) return true;
  await new Promise((r) => setTimeout(r, NOTIFY_RETRY_MS));
  return send();
}
