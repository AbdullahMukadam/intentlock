import { readFile } from "node:fs/promises";

import {
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";

import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { ENV, type Env } from "../config/config.module.js";
import type { OrgTx } from "../org/utils/org-db.util.js";
import { COMMUNITY_LICENSE } from "./constants/community-license.constant.js";
import {
  LICENSE_LIMIT_LOCK_ID,
  LICENSE_RECHECK_MS,
  VENDOR_PUBLIC_KEY,
} from "./constants/license.constants.js";
import { LicenseError } from "./enums/license-error.enum.js";
import type { LicenseFeature } from "./enums/license-feature.enum.js";
import { LicenseStatus } from "./enums/license-status.enum.js";
import { LicensedResource } from "./enums/licensed-resource.enum.js";
import type { License } from "./schemas/license.schema.js";
import { verifyLicense } from "./utils/verify-license.util.js";

// A license problem only changes limits; it never touches enforcement, holds or audit.
@Injectable()
export class LicenseService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LoggerContext.LICENSE);
  private license: License = COMMUNITY_LICENSE;
  private status = LicenseStatus.MISSING;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(VENDOR_PUBLIC_KEY) private readonly vendorKey: CryptoKey,
  ) {}

  async onModuleInit() {
    await this.load();
    this.timer = setInterval(() => void this.load(), LICENSE_RECHECK_MS);
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

  hasFeature(feature: LicenseFeature): boolean {
    return this.license.features.includes(feature);
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
      : db.agent.count({ where: { disabledAt: null } });
  }

  async load(): Promise<void> {
    const path = this.env.LICENSE_FILE;
    if (!path) {
      this.apply(COMMUNITY_LICENSE, LicenseStatus.MISSING);
      return;
    }
    let jws: string;
    try {
      jws = await readFile(path, "utf8");
    } catch (err) {
      this.fallback(
        LicenseStatus.INVALID,
        `cannot read ${path} (${(err as NodeJS.ErrnoException).code ?? String(err)})`,
      );
      return;
    }
    const result = await verifyLicense(jws, this.vendorKey, new Date());
    if (result.status === LicenseStatus.VALID) this.apply(result.license, LicenseStatus.VALID);
    else this.fallback(result.status, result.reason);
  }

  private fallback(status: LicenseStatus, reason: string) {
    this.log.warn(`License ${status} (${reason}); using the Community edition limits`);
    this.apply(COMMUNITY_LICENSE, status);
  }

  private apply(license: License, status: LicenseStatus) {
    this.license = license;
    this.status = status;
  }
}
