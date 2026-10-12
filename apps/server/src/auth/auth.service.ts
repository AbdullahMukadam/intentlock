import { HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { newSecret, safeEqual, sha256Hex } from "../common/utils/crypto.util.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SESSION_TTL_MS } from "./constants/session.constants.js";
import { AuthError } from "./enums/auth-error.enum.js";

// Unknown emails hash against this so both paths take the same time.
const NO_MATCH_HASH = sha256Hex("no-such-user");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, token: string, ip: string | undefined) {
    // v0.1 has one organization, so the email alone identifies the user.
    const user = await this.prisma.user.findFirst({ where: { email } });
    const matches = safeEqual(sha256Hex(token), user?.loginTokenHash ?? NO_MATCH_HASH);
    if (!user || !user.loginTokenHash || user.disabledAt || !matches) {
      const orgId = user?.orgId ?? (await this.prisma.organization.findFirst())?.id;
      if (orgId) {
        await this.audit.append(orgId, [
          { kind: AuditKind.AUTH_LOGIN_FAILED, payload: { email, ip: ip ?? null } },
        ]);
      }
      throw new UnauthorizedException({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: AuthError.INVALID_CREDENTIALS,
      });
    }

    const cookie = newSecret();
    await orgDb(this.prisma, user.orgId).session.create({
      data: {
        id: sha256Hex(cookie),
        orgId: user.orgId,
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    await this.audit.append(user.orgId, [
      { kind: AuditKind.AUTH_LOGIN, actor: user.id, payload: { email, ip: ip ?? null } },
    ]);
    return { cookie, user: { email: user.email, role: user.role, groups: user.groups } };
  }

  async logout(orgId: string, userId: string, sessionId: string) {
    await orgDb(this.prisma, orgId).session.deleteMany({ where: { id: sessionId } });
    await this.audit.append(orgId, [{ kind: AuditKind.AUTH_LOGOUT, actor: userId }]);
  }
}
