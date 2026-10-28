import { Inject, Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { ENV, type Env } from "../config/config.module.js";
import { emailHtml } from "./utils/email-layout.util.js";

@Injectable()
export class MailService {
  private readonly log = new Logger(LoggerContext.MAIL);
  private readonly transport: Transporter | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.transport = env.SMTP_URL ? createTransport(env.SMTP_URL) : null;
  }

  get enabled(): boolean {
    return this.transport !== null;
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (!this.transport) return false;
    try {
      await this.transport.sendMail({ from: this.env.SMTP_FROM, to, subject, text, html });
      return true;
    } catch (e) {
      this.log.warn(`Could not email ${to}: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  sendInvite(to: string, link: string, orgName: string, invitedBy: string): Promise<boolean> {
    const subject = `You're invited to ${orgName} on Intentlock`;
    return this.send(
      to,
      subject,
      `${invitedBy} invited you to join ${orgName} on Intentlock.\n\nAccept the invitation within 7 days:\n${link}\n`,
      emailHtml({
        preheader: `${invitedBy} invited you to join ${orgName}.`,
        eyebrow: "Team invitation",
        accent: "#2563eb",
        title: `Join ${orgName} on Intentlock`,
        intro: `${invitedBy} invited you to review and approve what your team's AI agents do.`,
        details: [
          { label: "Team", value: orgName },
          { label: "Invited by", value: invitedBy },
          { label: "Your email", value: to },
        ],
        button: { label: "Accept invitation", href: link },
        note: "The invitation expires in 7 days.",
        footer: "If you weren't expecting this invitation, you can ignore this email.",
      }),
    );
  }

  sendPasswordReset(to: string, link: string, validFor: string): Promise<boolean> {
    return this.send(
      to,
      "Reset your Intentlock password",
      `Use this link within ${validFor} to set a new Intentlock password:\n${link}\n\nIf you did not ask for this, ignore this email.\n`,
      emailHtml({
        preheader: `Set a new password within ${validFor}.`,
        eyebrow: "Password reset",
        accent: "#18181b",
        title: "Reset your password",
        intro: `Someone asked to reset the Intentlock password for ${to}. Use the button below within ${validFor} to choose a new one.`,
        button: { label: "Set a new password", href: link },
        note: "The link works once. Your current password keeps working until you set a new one.",
        footer:
          "If you didn't ask for this, ignore this email. Nobody can change your password without the link.",
      }),
    );
  }

  sendLicenseNotice(
    to: string,
    notice: { licensee: string; expiresAt: Date; daysLeft: number | null; link: string },
  ): Promise<boolean> {
    const date = notice.expiresAt.toISOString().slice(0, 10);
    const expired = notice.daysLeft === null;
    const when = expired
      ? `expired on ${date}`
      : `expires on ${date} (in ${String(notice.daysLeft)} day${notice.daysLeft === 1 ? "" : "s"})`;
    const outcome = expired
      ? "The install now runs with the free limits (5 users, 3 agents). Nothing is switched off and agents keep running, but no users or agents can be added past those limits."
      : "After it expires, the install keeps its limits for 14 days, then falls back to the free limits. Enforcement, holds and the audit log never stop.";
    return this.send(
      to,
      expired ? "Your Intentlock license has expired" : `Your Intentlock license ${when}`,
      `The Intentlock license for ${notice.licensee} ${when}.

${outcome}

Renew it and paste the new key on the License page:
${notice.link}
`,
      emailHtml({
        preheader: `The license for ${notice.licensee} ${when}.`,
        eyebrow: "License",
        accent: expired ? "#dc2626" : "#d97706",
        title: expired ? "Your license has expired" : "Your license expires soon",
        intro: `The Intentlock license for ${notice.licensee} ${when}.`,
        details: [
          { label: "Licensed to", value: notice.licensee },
          { label: expired ? "Expired" : "Expires", value: date },
        ],
        button: { label: "Open the License page", href: notice.link },
        note: outcome,
        footer: "You get this email because you are an admin of this Intentlock install.",
      }),
    );
  }

  sendAuditArchiveFailed(
    to: string,
    failure: { fromSeq: number; toSeq: number; reason: string; link: string },
  ): Promise<boolean> {
    const range = `entries ${String(failure.fromSeq)} to ${String(failure.toSeq)}`;
    const outcome =
      "Nothing was deleted. The job tries again tomorrow; fix the archive target (AUDIT_ARCHIVE_DIR or AUDIT_ARCHIVE_S3_*) before then.";
    return this.send(
      to,
      "Intentlock could not archive old audit entries",
      `Intentlock could not archive audit ${range}, so it did not delete them.\n\nReason: ${failure.reason}\n\n${outcome}\n\n${failure.link}\n`,
      emailHtml({
        preheader: `Archiving audit ${range} failed; nothing was deleted.`,
        eyebrow: "Audit archive",
        accent: "#dc2626",
        title: "Archiving old audit entries failed",
        intro: `Intentlock could not archive audit ${range}, so it did not delete them.`,
        details: [
          { label: "Entries", value: `${String(failure.fromSeq)} to ${String(failure.toSeq)}` },
          { label: "Reason", value: failure.reason },
        ],
        button: { label: "Open the Audit page", href: failure.link },
        note: outcome,
        footer: "You get this email because you are an admin of this Intentlock install.",
      }),
    );
  }
}
