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
}
