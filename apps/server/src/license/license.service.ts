import { readFile } from "node:fs/promises";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { AuditService } from "../audit/audit.service.js";
import { AuditKind } from "../audit/enums/audit-kind.enum.js";
import { AppPage } from "../common/enums/app-page.enum.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { ENV, type Env } from "../config/config.module.js";
import { orgDb, type OrgTx } from "../org/utils/org-db.util.js";
import { MailService } from "../mail/mail.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { FREE_LICENSE } from "./constants/free-license.constant.js";
import {
  DAY_MS,
  LICENSE_LIMIT_LOCK_ID,
  LICENSE_RECHECK_MS,
  VENDOR_PUBLIC_KEY,
} from "./constants/license.constants.js";
import { LicenseError } from "./enums/license-error.enum.js";
import { LicenseNotice } from "./enums/license-notice.enum.js";
import { LicenseSource } from "./enums/license-source.enum.js";
import { LicenseStatus } from "./enums/license-status.enum.js";
import { LicensedResource } from "./enums/licensed-resource.enum.js";
import type { License } from "./schemas/license.schema.js";
import type { LicenseCheck } from "./types/license-check.type.js";
import { dueExpiryNotice } from "./utils/due-notice.util.js";
import { verifyLicense } from "./utils/verify-license.util.js";

// A license problem only changes limits; it never touches enforcement, holds or audit.
@Injectable()
export class LicenseService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LoggerContext.LICENSE);
  private license: License = FREE_LICENSE;
  private status = LicenseStatus.MISSING;
  private source = LicenseSource.NONE;
  private lastWarning: string | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(VENDOR_PUBLIC_KEY) private readonly vendorKey: CryptoKey,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async onModuleInit() {
    await this.load().catch((err: unknown) => this.log.error(err));
    this.timer = setInterval(() => {
      this.load().catch((err: unknown) => this.log.error(err));
    }, LICENSE_RECHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  current(): License {
    return this.license;
  }

  currentStatus(): LicenseStatus {
    return this.status;
  }

  currentSource(): LicenseSource {
    return this.source;
  }

  async assertWithinLimit(tx: OrgTx, resource: LicensedResource): Promise<void> {
    const max =
      resource === LicensedResource.USERS ? this.license.maxUsers : this.license.maxAgents;
    if (max === null) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LICENSE_LIMIT_LOCK_ID})`;
    const used = await this.countActive(tx, resource);
    if (used < max) return;
    throw new ForbiddenException({
      statusCode: HttpStatus.FORBIDDEN,
      error:
        resource === LicensedResource.USERS
          ? LicenseError.USER_LIMIT_REACHED
          : LicenseError.AGENT_LIMIT_REACHED,
      max,
      edition: this.license.edition,
    });
  }

  countActive(db: Pick<OrgTx, "user" | "agent">, resource: LicensedResource): Promise<number> {
    return resource === LicensedResource.USERS
      ? db.user.count({ where: { disabledAt: null } })
      : db.agent.count({ where: { disabledAt: null, deletedAt: null } });
  }

  async applyKey(admin: SessionUser, key: string): Promise<void> {
    this.assertNotFromFile();
    const result = await verifyLicense(key, this.vendorKey, await this.clock(admin.orgId));
    if (result.status !== LicenseStatus.VALID) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        error:
          result.status === LicenseStatus.INVALID
            ? LicenseError.LICENSE_INVALID
            : LicenseError.LICENSE_EXPIRED,
        reason: "reason" in result ? result.reason : "license expired",
      });
    }
    const { licensee, maxUsers, exp } = result.license;
    await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      await tx.license.deleteMany({});
      await tx.license.create({ data: { orgId: admin.orgId, jws: key, appliedBy: admin.id } });
      await this.audit.append(
        admin.orgId,
        [
          {
            kind: AuditKind.LICENSE_APPLIED,
            actor: admin.id,
            payload: { licensee, seats: maxUsers, expiresAt: new Date(exp * 1000).toISOString() },
          },
        ],
        tx,
      );
    });
    await this.load();
  }

  async removeKey(admin: SessionUser): Promise<void> {
    this.assertNotFromFile();
    await orgDb(this.prisma, admin.orgId).$transaction(async (tx) => {
      const { count } = await tx.license.deleteMany({});
      if (count === 0) return;
      await this.audit.append(
        admin.orgId,
        [{ kind: AuditKind.LICENSE_REMOVED, actor: admin.id }],
        tx,
      );
    });
    await this.load();
  }

  async load(): Promise<void> {
    const org = await this.prisma.organization.findFirst({ select: { id: true } });
    const now = org ? await this.clock(org.id) : new Date();
    const path = this.env.LICENSE_FILE;
    let jws: string | undefined;
    if (path) {
      try {
        jws = await readFile(path, "utf8");
      } catch (err) {
        this.fallback(
          LicenseStatus.INVALID,
          LicenseSource.FILE,
          `cannot read ${path} (${(err as NodeJS.ErrnoException).code ?? String(err)})`,
        );
        return;
      }
    } else if (org) {
      jws = (await orgDb(this.prisma, org.id).license.findFirst())?.jws;
    }
    const source = path ? LicenseSource.FILE : LicenseSource.DATABASE;
    if (jws === undefined) {
      this.apply(FREE_LICENSE, LicenseStatus.MISSING, LicenseSource.NONE);
      return;
    }
    const result = await verifyLicense(jws, this.vendorKey, now);
    if (result.status === LicenseStatus.INVALID) {
      this.fallback(result.status, source, result.reason);
      return;
    }
    if (result.status === LicenseStatus.EXPIRED)
      this.fallback(result.status, source, result.reason);
    else this.apply(result.license, result.status, source);
    if (org)
      await this.sendNotice(org.id, result, now).catch((err: unknown) => this.log.error(err));
  }

  private async sendNotice(
    orgId: string,
    result: Exclude<LicenseCheck, { status: LicenseStatus.INVALID }>,
    now: Date,
  ): Promise<void> {
    const { license } = result;
    const notice =
      result.status === LicenseStatus.EXPIRED
        ? LicenseNotice.EXPIRED
        : result.status === LicenseStatus.VALID
          ? dueExpiryNotice(license.exp, now)
          : null;
    if (!notice) return;
    const expiresAt = new Date(license.exp * 1000);
    const db = orgDb(this.prisma, orgId);
    const claimed = await db.$transaction(async (tx) => {
      const { count } = await tx.licenseNotice.createMany({
        data: [{ orgId, expiresAt, kind: notice }],
        skipDuplicates: true,
      });
      if (count === 0) return false;
      if (notice === LicenseNotice.EXPIRED) {
        await this.audit.append(
          orgId,
          [
            {
              kind: AuditKind.LICENSE_EXPIRED,
              payload: { licensee: license.licensee, expiresAt: expiresAt.toISOString() },
            },
          ],
          tx,
        );
      }
      return true;
    });
    if (!claimed) return;
    const admins = await db.user.findMany({
      where: { role: UserRole.ADMIN, disabledAt: null },
      select: { email: true },
    });
    const daysLeft =
      notice === LicenseNotice.EXPIRED
        ? null
        : Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
    const link = `${this.env.PUBLIC_URL}${AppPage.LICENSE}`;
    await Promise.all(
      admins.map((a) =>
        this.mail.sendLicenseNotice(a.email, {
          licensee: license.licensee,
          expiresAt,
          daysLeft,
          link,
        }),
      ),
    );
  }

  private async clock(orgId: string): Promise<Date> {
    const now = new Date();
    const [row] = await this.prisma.$queryRaw<{ at: Date }[]>`
      UPDATE "Organization"
      SET "licenseClockAt" = GREATEST(COALESCE("licenseClockAt", ${now}), ${now})
      WHERE id = ${orgId}
      RETURNING "licenseClockAt" AS at`;
    return row?.at ?? now;
  }

  private assertNotFromFile() {
    if (!this.env.LICENSE_FILE) return;
    throw new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      error: LicenseError.LICENSE_FROM_FILE,
    });
  }

  private fallback(status: LicenseStatus, source: LicenseSource, reason: string) {
    const warning = `License ${status} (${reason}); using the free limits`;
    if (warning !== this.lastWarning) this.log.warn(warning);
    this.lastWarning = warning;
    this.apply(FREE_LICENSE, status, source);
  }

  private apply(license: License, status: LicenseStatus, source: LicenseSource) {
    if (status !== LicenseStatus.INVALID && status !== LicenseStatus.EXPIRED)
      this.lastWarning = undefined;
    this.license = license;
    this.status = status;
    this.source = source;
  }
}
