import { Inject, Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { ENV, type Env } from "../config/config.module.js";

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
    return this.send(
      to,
      `You're invited to ${orgName} on Intentlock`,
      `${invitedBy} invited you to join ${orgName} on Intentlock.\n\nAccept the invitation within 7 days:\n${link}\n`,
    );
  }

  sendPasswordReset(to: string, link: string, validFor: string): Promise<boolean> {
    return this.send(
      to,
      "Reset your Intentlock password",
      `Use this link within ${validFor} to set a new Intentlock password:\n${link}\n\nIf you did not ask for this, ignore this email.\n`,
    );
  }
}
