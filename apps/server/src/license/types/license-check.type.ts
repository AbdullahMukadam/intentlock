import type { LicenseStatus } from "../enums/license-status.enum.js";
import type { License } from "../schemas/license.schema.js";

export type LicenseCheck =
  | { status: LicenseStatus.VALID; license: License }
  | { status: LicenseStatus.INVALID | LicenseStatus.EXPIRED; reason: string };
