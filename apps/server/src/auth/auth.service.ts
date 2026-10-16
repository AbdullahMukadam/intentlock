import {
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { AppPage } from "../common/enums/app-page.enum.js";
import { appLink } from "../common/utils/app-link.util.js";
import { safeEqual, sha256Hex } from "../common/utils/crypto.util.js";
import { ENV, type Env } from "../config/config.module.js";
import { MailService } from "../mail/mail.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SELF_RESET_TTL_MS } from "./constants/password-reset.constants.js";
import { AuthError } from "./enums/auth-error.enum.js";
import { SignInMethod } from "./enums/sign-in-method.enum.js";
import { OAUTH_PROVIDERS } from "./oauth/constants/oauth.constants.js";
import type { OAuthProviders } from "./oauth/utils/oauth-providers.util.js";
import { SessionsService } from "./sessions.service.js";
import type { RequestMeta } from "./types/request-meta.type.js";
import { assertStrongPassword } from "./utils/assert-strong-password.util.js";
import { issueResetToken } from "./utils/issue-reset-token.util.js";
import { linkInvalid } from "./utils/link-invalid.util.js";
import { hashPassword, verifyPassword } from "./utils/password.util.js";

const NO_MATCH_HASH = sha256Hex("no-such-user");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProviders,
  ) {}

  methods() {
    return {
      password: true,
      google: this.providers.google !== null,
      github: this.providers.github !== null,
      passwordReset: this.mail.enabled,
    };
  }

  async login(
    input: { email: string; password?: string | undefined; token?: string | undefined },
    meta: RequestMeta,
  ) {
    const { email } = input;
    const user = await this.prisma.user.findFirst({ where: { email } });
    const method = input.token === undefined ? SignInMethod.PASSWORD : SignInMethod.TOKEN;
    const matches =
      input.token === undefined
        ? await verifyPassword(input.password ?? "", user?.passwordHash ?? null)
        : safeEqual(sha256Hex(input.token), user?.cliTokenHash ?? NO_MATCH_HASH) &&
          Boolean(user?.cliTokenHash);
    if (!user || user.disabledAt || !matches) {
      const orgId = user?.orgId ?? (await this.prisma.organization.findFirst())?.id;
      if (orgId) {
        await this.audit.append(orgId, [
          { kind: AuditKind.AUTH_LOGIN_FAILED, payload: { email, method, ip: meta.ip } },
        ]);
      }
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: AuthError.INVALID_CREDENTIALS,
      });
    }

    const cookie = await this.sessions.create(user, meta);
    await this.audit.append(user.orgId, [
      { kind: AuditKind.AUTH_LOGIN, actor: user.id, payload: { email, method, ip: meta.ip } },
    ]);
    return { cookie, user: { email: user.email, role: user.role, groups: user.groups } };
  }

  async logout(orgId: string, userId: string, sessionId: string) {
    await orgDb(this.prisma, orgId).session.deleteMany({ where: { id: sessionId } });
    await this.audit.append(orgId, [{ kind: AuditKind.AUTH_LOGOUT, actor: userId }]);
  }

  async forgotPassword(email: string, meta: RequestMeta) {
    if (!this.mail.enabled) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: AuthError.PASSWORD_RESET_DISABLED,
      });
    }
    const user = await this.prisma.user.findFirst({ where: { email, disabledAt: null } });
    if (!user) return;
    const { token } = await orgDb(this.prisma, user.orgId).$transaction(async (tx) => {
      const issued = await issueResetToken(tx, {
        orgId: user.orgId,
        userId: user.id,
        createdBy: null,
        ttlMs: SELF_RESET_TTL_MS,
      });
      await this.audit.append(
        user.orgId,
        [
          {
            kind: AuditKind.PASSWORD_RESET_CREATED,
            actor: user.id,
            payload: { email, selfService: true, ip: meta.ip },
          },
        ],
        tx,
      );
      return issued;
    });
    void this.mail.sendPasswordReset(email, appLink(this.env, AppPage.RESET, token), "1 hour");
  }

  async resetPassword(token: string, password: string, meta: RequestMeta) {
    const reset = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: sha256Hex(token) },
    });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) throw linkInvalid();
    const user = await this.prisma.user.findUnique({ where: { id: reset.userId } });
    if (!user || user.disabledAt || user.orgId !== reset.orgId) throw linkInvalid();
    assertStrongPassword(user.email, password);
    const passwordHash = await hashPassword(password);

    await orgDb(this.prisma, user.orgId).$transaction(async (tx) => {
      const used = await tx.passwordReset.updateMany({
        where: { id: reset.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count !== 1) throw linkInvalid();
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await this.audit.append(
        user.orgId,
        [
          {
            kind: AuditKind.PASSWORD_RESET,
            actor: user.id,
            payload: { email: user.email, ip: meta.ip },
          },
        ],
        tx,
      );
    });
  }
}
