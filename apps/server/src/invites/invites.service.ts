import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { SignInMethod } from "../auth/enums/sign-in-method.enum.js";
import { SessionsService } from "../auth/sessions.service.js";
import type { RequestMeta } from "../auth/types/request-meta.type.js";
import { assertStrongPassword } from "../auth/utils/assert-strong-password.util.js";
import { linkInvalid } from "../auth/utils/link-invalid.util.js";
import { hashPassword } from "../auth/utils/password.util.js";
import { AppPage } from "../common/enums/app-page.enum.js";
import { PrismaErrorCode } from "../common/enums/prisma-error-code.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { appLink } from "../common/utils/app-link.util.js";
import { newSecret, sha256Hex } from "../common/utils/crypto.util.js";
import { ENV, type Env } from "../config/config.module.js";
import { type Invite, Prisma, type Role } from "../generated/prisma/client.js";
import { LicensedResource } from "../license/enums/licensed-resource.enum.js";
import { LicenseService } from "../license/license.service.js";
import { MailService } from "../mail/mail.service.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserError } from "../users/enums/user-error.enum.js";
import { emailsById } from "../users/utils/emails-by-id.util.js";
import { INVITE_TTL_MS } from "./constants/invite.constants.js";
import { InviteError } from "./enums/invite-error.enum.js";
import { toInviteView } from "./utils/to-invite-view.util.js";

const pending = () => ({ acceptedAt: null, revokedAt: null });

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
    private readonly sessions: SessionsService,
    private readonly mail: MailService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(admin: SessionUser, input: { email: string; role: Role; groups: string[] }) {
    const token = newSecret();
    const invite = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      if (await tx.user.findFirst({ where: { email: input.email } })) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: UserError.USER_EXISTS,
        });
      }
      const open = await tx.invite.findFirst({
        where: { email: input.email, ...pending(), expiresAt: { gt: new Date() } },
      });
      if (open) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: InviteError.INVITE_EXISTS,
        });
      }
      const created = await tx.invite.create({
        data: {
          ...input,
          orgId: admin.orgId,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          invitedBy: admin.id,
        },
      });
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.INVITE_CREATED, actor: admin.id, payload: { ...input } }],
        tx,
      );
      return created;
    });
    return this.deliver(admin, invite, token);
  }

  async list(orgId: string) {
    const db = orgDb(this.prisma, orgId);
    const invites = await db.invite.findMany({ where: pending(), orderBy: { createdAt: "desc" } });
    const emails = await emailsById(
      db,
      invites.map((i) => i.invitedBy),
    );
    return invites.map((i) => toInviteView(i, emails.get(i.invitedBy) ?? null));
  }

  async resend(admin: SessionUser, id: string) {
    const token = newSecret();
    const invite = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const updated = await tx.invite.updateMany({
        where: { id, ...pending() },
        data: { tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
      });
      if (updated.count !== 1) throw notFound();
      const row = await tx.invite.findUniqueOrThrow({ where: { id } });
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.INVITE_RESENT, actor: admin.id, payload: { email: row.email } }],
        tx,
      );
      return row;
    });
    return this.deliver(admin, invite, token);
  }

  async revoke(admin: SessionUser, id: string) {
    await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const row = await tx.invite.findFirst({ where: { id, ...pending() } });
      const updated = await tx.invite.updateMany({
        where: { id, ...pending() },
        data: { revokedAt: new Date() },
      });
      if (!row || updated.count !== 1) throw notFound();
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.INVITE_REVOKED, actor: admin.id, payload: { email: row.email } }],
        tx,
      );
    });
  }

  async lookup(token: string) {
    const invite = await this.findValid(token);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: invite.orgId } });
    return {
      email: invite.email,
      role: invite.role,
      orgName: org.name,
      expiresAt: invite.expiresAt,
    };
  }

  async accept(token: string, password: string, meta: RequestMeta) {
    const invite = await this.findValid(token);
    assertStrongPassword(invite.email, password);
    const passwordHash = await hashPassword(password);
    return this.consume(invite, { passwordHash }, meta, SignInMethod.PASSWORD);
  }

  async findValid(token: string): Promise<Invite> {
    const invite = await this.prisma.invite.findUnique({ where: { tokenHash: sha256Hex(token) } });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt.getTime() <= Date.now()
    ) {
      throw linkInvalid();
    }
    return invite;
  }

  async consume(
    invite: Invite,
    userData: { passwordHash?: string },
    meta: RequestMeta,
    method: SignInMethod,
  ) {
    try {
      return await orgDb(this.prisma, invite.orgId).$transaction(async (tx) => {
        await this.license.assertWithinLimit(tx, LicensedResource.USERS);
        const claimed = await tx.invite.updateMany({
          where: { id: invite.id, ...pending(), expiresAt: { gt: new Date() } },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw linkInvalid();
        const user = await tx.user.create({
          data: {
            orgId: invite.orgId,
            email: invite.email,
            role: invite.role,
            groups: invite.groups,
            ...userData,
          },
        });
        await this.audit.append(
          invite.orgId,
          [
            {
              kind: AuditKind.INVITE_ACCEPTED,
              actor: user.id,
              payload: { email: user.email, role: user.role, groups: user.groups, method },
            },
            {
              kind: AuditKind.AUTH_LOGIN,
              actor: user.id,
              payload: { email: user.email, method, ip: meta.ip },
            },
          ],
          tx,
        );
        const cookie = await this.sessions.create(user, meta, tx);
        return { cookie, user: { email: user.email, role: user.role, groups: user.groups } };
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          error: UserError.USER_EXISTS,
        });
      }
      throw e;
    }
  }

  private async deliver(admin: SessionUser, invite: Invite, token: string) {
    const link = appLink(this.env, AppPage.INVITE, token);
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: admin.orgId } });
    const emailed = await this.mail.sendInvite(invite.email, link, org.name, admin.email);
    return { invite: toInviteView(invite, admin.email), link, emailed };
  }
}

function notFound() {
  return new NotFoundException({
    statusCode: HttpStatus.NOT_FOUND,
    error: InviteError.INVITE_NOT_FOUND,
  });
}
