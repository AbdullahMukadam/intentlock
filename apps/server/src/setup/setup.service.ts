import {
  ConflictException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { SignInMethod } from "../auth/enums/sign-in-method.enum.js";
import { SessionsService } from "../auth/sessions.service.js";
import type { RequestMeta } from "../auth/types/request-meta.type.js";
import { assertStrongPassword } from "../auth/utils/assert-strong-password.util.js";
import { hashPassword } from "../auth/utils/password.util.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { safeEqual, sha256Hex } from "../common/utils/crypto.util.js";
import { ENV, type Env } from "../config/config.module.js";
import { BOOTSTRAP_LOCK_ID } from "../org/constants/org.constants.js";
import { createDemoUsers } from "../org/utils/create-demo-users.util.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { SetupError } from "./enums/setup-error.enum.js";

@Injectable()
export class SetupService {
  private readonly log = new Logger(LoggerContext.SETUP);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async status() {
    return { setupRequired: (await this.prisma.user.count()) === 0 };
  }

  async setup(
    input: { code: string; email: string; password: string; orgName?: string | undefined },
    meta: RequestMeta,
  ) {
    const org = await this.prisma.organization.findFirst();
    if ((await this.prisma.user.count()) > 0) throw complete();
    if (!org) throw invalidCode();
    assertStrongPassword(input.email, input.password);
    const passwordHash = await hashPassword(input.password);

    const result = await orgDb(this.prisma, org.id).$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_ID})`;
      if ((await tx.user.count()) > 0) throw complete();
      const current = await tx.organization.findUnique({ where: { id: org.id } });
      const hash = current?.setupCodeHash;
      if (!hash || !safeEqual(sha256Hex(input.code), hash)) return null;

      await tx.organization.update({
        where: { id: org.id },
        data: { setupCodeHash: null, name: input.orgName ?? org.name },
      });
      const admin = await tx.user.create({
        data: { orgId: org.id, email: input.email, role: UserRole.ADMIN, passwordHash },
      });
      const demo = this.env.INTENTLOCK_DEMO
        ? await createDemoUsers(tx, org.id, input.email.split("@")[1] ?? "example.com")
        : {};
      await this.audit.append(
        org.id,
        [
          {
            kind: AuditKind.SETUP_COMPLETED,
            actor: admin.id,
            payload: { email: input.email, demoUsers: Object.keys(demo), ip: meta.ip },
          },
          {
            kind: AuditKind.AUTH_LOGIN,
            actor: admin.id,
            payload: { email: input.email, method: SignInMethod.PASSWORD, ip: meta.ip },
          },
        ],
        tx,
      );
      const cookie = await this.sessions.create(admin, meta, tx);
      return { cookie, admin, demo };
    });

    if (!result) {
      await this.audit.append(org.id, [
        { kind: AuditKind.SETUP_FAILED, payload: { email: input.email, ip: meta.ip } },
      ]);
      throw invalidCode();
    }
    for (const [email, password] of Object.entries(result.demo)) {
      this.log.warn(`Demo user ${email} password (shown once): ${password}`);
    }
    const { admin } = result;
    return {
      cookie: result.cookie,
      user: { email: admin.email, role: admin.role, groups: admin.groups },
    };
  }
}

function complete() {
  return new ConflictException({
    statusCode: HttpStatus.CONFLICT,
    error: SetupError.SETUP_COMPLETE,
  });
}

function invalidCode() {
  return new UnauthorizedException({
    statusCode: HttpStatus.UNAUTHORIZED,
    error: SetupError.INVALID_SETUP_CODE,
  });
}
