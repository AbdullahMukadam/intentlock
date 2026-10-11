import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import type { SessionUser } from "../common/auth.decorators.js";
import { newSecret, sha256Hex } from "../common/secrets.js";
import { Prisma, type Role, type User } from "../generated/prisma/client.js";
import { orgDb } from "../org/org-db.js";
import { PrismaService } from "../prisma/prisma.service.js";

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    groups: u.groups,
    disabledAt: u.disabledAt,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(admin: SessionUser, input: { email: string; role: Role; groups: string[] }) {
    const token = newSecret();
    try {
      const user = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { ...input, orgId: admin.orgId, loginTokenHash: sha256Hex(token) },
        });
        await this.audit.append(
          admin.orgId,
          [
            {
              kind: "user_created",
              actor: admin.id,
              payload: { email: input.email, role: input.role, groups: input.groups },
            },
          ],
          tx,
        );
        return created;
      });
      return { user: publicUser(user), loginToken: token };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new ConflictException({ statusCode: 409, error: "user_exists" });
      }
      throw e;
    }
  }

  async list(orgId: string) {
    const users = await orgDb(this.prisma, orgId).user.findMany({ orderBy: { createdAt: "asc" } });
    return users.map(publicUser);
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
    if (target.id === admin.id && (patch.disabled || (patch.role && patch.role !== "admin"))) {
      throw new BadRequestException({ statusCode: 400, error: "cannot_demote_or_disable_self" });
    }
    const disabledAt =
      patch.disabled === undefined
        ? undefined
        : patch.disabled
          ? (target.disabledAt ?? new Date())
          : null;
    const user = await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { role: patch.role, groups: patch.groups, disabledAt },
      });
      if (patch.disabled) await tx.session.deleteMany({ where: { userId: target.id } });
      await this.audit.append(
        admin.orgId,
        [{ kind: "user_updated", actor: admin.id, payload: { email, ...patch } }],
        tx,
      );
      return updated;
    });
    return publicUser(user);
  }

  async reissueToken(admin: SessionUser, email: string) {
    const target = await this.find(admin.orgId, email);
    const token = newSecret();
    await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: { loginTokenHash: sha256Hex(token) },
      });
      await tx.session.deleteMany({ where: { userId: target.id } });
      await this.audit.append(
        admin.orgId,
        [{ kind: "user_token_reissued", actor: admin.id, payload: { email } }],
        tx,
      );
    });
    return { loginToken: token };
  }

  private async find(orgId: string, email: string) {
    const user = await orgDb(this.prisma, orgId).user.findFirst({ where: { email } });
    if (!user) throw new NotFoundException({ statusCode: 404, error: "user_not_found" });
    return user;
  }
}
