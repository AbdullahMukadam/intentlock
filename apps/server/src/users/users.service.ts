import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { ADMIN_RESET_TTL_MS } from "../auth/constants/password-reset.constants.js";
import { issueResetToken } from "../auth/utils/issue-reset-token.util.js";
import { AppPage } from "../common/enums/app-page.enum.js";
import { appLink } from "../common/utils/app-link.util.js";
import { ENV, type Env } from "../config/config.module.js";
import { MailService } from "../mail/mail.service.js";
import { LicensedResource } from "../license/enums/licensed-resource.enum.js";
import { LicenseService } from "../license/license.service.js";
import type { SessionUser } from "../common/types/auth.types.js";
import type { Role } from "../generated/prisma/client.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserError } from "./enums/user-error.enum.js";
import { UserRole } from "./enums/user-role.enum.js";
import { toPublicUser } from "./utils/to-public-user.util.js";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(me: SessionUser) {
    const users = await orgDb(this.prisma, me.orgId).user.findMany({
      orderBy: { createdAt: "asc" },
      include: { identities: { select: { provider: true } } },
    });
    if (me.role === UserRole.ADMIN) return users.map(toPublicUser);
    return users.map((u) => ({
      email: u.email,
      role: u.role,
      groups: u.groups,
      disabledAt: u.disabledAt,
    }));
  }

  async update(
    admin: SessionUser,
    email: string,
    patch: {
      role?: Role | undefined;
      groups?: string[] | undefined;
      disabled?: boolean | undefined;
    },
  ) {
    const target = await this.find(admin.orgId, email);
    // Guard against an admin locking everyone out by demoting or disabling themselves.
    if (
      target.id === admin.id &&
      (patch.disabled || (patch.role && patch.role !== UserRole.ADMIN))
    ) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error: UserError.CANNOT_DEMOTE_OR_DISABLE_SELF,
      });
    }
    const disabledAt =
      patch.disabled === undefined
        ? undefined
        : patch.disabled
          ? (target.disabledAt ?? new Date())
          : null;
    const user = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      if (patch.disabled === false && target.disabledAt) {
        await this.license.assertWithinLimit(tx, LicensedResource.USERS);
      }
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { role: patch.role, groups: patch.groups, disabledAt },
        include: { identities: { select: { provider: true } } },
      });
      if (patch.disabled) await tx.session.deleteMany({ where: { userId: target.id } });
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.USER_UPDATED, actor: admin.id, payload: { email, ...patch } }],
        tx,
      );
      return updated;
    });
    return toPublicUser(user);
  }

  async createResetLink(admin: SessionUser, email: string) {
    const target = await this.find(admin.orgId, email);
    const { token, expiresAt } = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const issued = await issueResetToken(tx, {
        orgId: admin.orgId,
        userId: target.id,
        createdBy: admin.id,
        ttlMs: ADMIN_RESET_TTL_MS,
      });
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.PASSWORD_RESET_CREATED, actor: admin.id, payload: { email } }],
        tx,
      );
      return issued;
    });
    const link = appLink(this.env, AppPage.RESET, token);
    const emailed = await this.mail.sendPasswordReset(email, link, "24 hours");
    return { link, expiresAt, emailed };
  }

  private async find(orgId: string, email: string) {
    const user = await orgDb(this.prisma, orgId).user.findFirst({ where: { email } });
    if (!user)
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        error: UserError.USER_NOT_FOUND,
      });
    return user;
  }
}
