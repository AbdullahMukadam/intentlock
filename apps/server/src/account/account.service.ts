import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { assertStrongPassword } from "../auth/utils/assert-strong-password.util.js";
import { hashPassword, verifyPassword } from "../auth/utils/password.util.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { newSecret, sha256Hex } from "../common/utils/crypto.util.js";
import type { IdentityProvider } from "../generated/prisma/client.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AccountError } from "./enums/account-error.enum.js";

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(me: SessionUser) {
    const user = await orgDb(this.prisma, me.orgId).user.findFirstOrThrow({
      where: { id: me.id },
      include: { identities: { orderBy: { createdAt: "asc" } } },
    });
    return {
      email: user.email,
      role: user.role,
      groups: user.groups,
      hasPassword: user.passwordHash !== null,
      identities: user.identities.map((i) => ({
        provider: i.provider,
        email: i.email,
        createdAt: i.createdAt,
      })),
      cliToken: user.cliTokenCreatedAt ? { createdAt: user.cliTokenCreatedAt } : null,
    };
  }

  async changePassword(me: SessionUser, currentPassword: string | undefined, newPassword: string) {
    const db = orgDb(this.prisma, me.orgId);
    const user = await db.user.findFirstOrThrow({ where: { id: me.id } });
    if (user.passwordHash && !(await verifyPassword(currentPassword ?? "", user.passwordHash))) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: AccountError.WRONG_PASSWORD,
      });
    }
    assertStrongPassword(user.email, newPassword);
    const passwordHash = await hashPassword(newPassword);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: me.id }, data: { passwordHash } });
      const ended = await tx.session.deleteMany({
        where: { userId: me.id, id: { not: me.sessionId } },
      });
      await this.audit.append(
        me.orgId,
        [
          {
            kind: AuditKind.PASSWORD_CHANGED,
            actor: me.id,
            payload: {
              email: me.email,
              firstPassword: user.passwordHash === null,
              endedSessions: ended.count,
            },
          },
        ],
        tx,
      );
    });
  }

  async sessions(me: SessionUser) {
    const rows = await orgDb(this.prisma, me.orgId).session.findMany({
      where: { userId: me.id, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((s) => ({
      current: s.id === me.sessionId,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  async signOutOthers(me: SessionUser) {
    await orgDb(this.prisma, me.orgId).$transaction(async (tx) => {
      const ended = await tx.session.deleteMany({
        where: { userId: me.id, id: { not: me.sessionId } },
      });
      await this.audit.append(
        me.orgId,
        [{ kind: AuditKind.SESSIONS_REVOKED, actor: me.id, payload: { count: ended.count } }],
        tx,
      );
    });
  }

  async unlink(me: SessionUser, provider: IdentityProvider) {
    await orgDb(this.prisma, me.orgId).$transaction(async (tx) => {
      const user = await tx.user.findFirstOrThrow({
        where: { id: me.id },
        include: { identities: true },
      });
      const identity = user.identities.find((i) => i.provider === provider);
      if (!identity) {
        throw new NotFoundException({
          statusCode: HttpStatus.NOT_FOUND,
          error: AccountError.IDENTITY_NOT_FOUND,
        });
      }
      if (!user.passwordHash && user.identities.length === 1) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: AccountError.LAST_SIGN_IN_METHOD,
        });
      }
      await tx.identity.deleteMany({ where: { id: identity.id } });
      await this.audit.append(
        me.orgId,
        [
          {
            kind: AuditKind.IDENTITY_UNLINKED,
            actor: me.id,
            payload: { email: me.email, provider },
          },
        ],
        tx,
      );
    });
  }

  async createCliToken(me: SessionUser) {
    const token = newSecret();
    await orgDb(this.prisma, me.orgId).$transaction(async (tx) => {
      await tx.user.update({
        where: { id: me.id },
        data: { cliTokenHash: sha256Hex(token), cliTokenCreatedAt: new Date() },
      });
      await this.audit.append(
        me.orgId,
        [{ kind: AuditKind.CLI_TOKEN_CREATED, actor: me.id, payload: { email: me.email } }],
        tx,
      );
    });
    return { token };
  }

  async revokeCliToken(me: SessionUser) {
    await orgDb(this.prisma, me.orgId).$transaction(async (tx) => {
      await tx.user.update({
        where: { id: me.id },
        data: { cliTokenHash: null, cliTokenCreatedAt: null },
      });
      await this.audit.append(
        me.orgId,
        [{ kind: AuditKind.CLI_TOKEN_REVOKED, actor: me.id, payload: { email: me.email } }],
        tx,
      );
    });
  }
}
