import type { LicenseStatus } from "../enums/license-status.enum.js";
import type { License } from "../schemas/license.schema.js";

export type LicenseCheck =
  | { status: LicenseStatus.VALID | LicenseStatus.GRACE; license: License }
  | { status: LicenseStatus.EXPIRED; license: License; reason: string }
  | { status: LicenseStatus.INVALID; reason: string };
