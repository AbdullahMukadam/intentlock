import { LicenseNotice } from "../enums/license-notice.enum.js";

export const VENDOR_PUBLIC_KEY = Symbol("VENDOR_PUBLIC_KEY");
export const LICENSE_RECHECK_MS = 60 * 1000;
export const MAX_LICENSE_CHARS = 8192;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const LICENSE_GRACE_MS = 14 * DAY_MS;
export const LICENSE_EXPIRY_NOTICES = [
  { days: 30, notice: LicenseNotice.EXPIRES_IN_30_DAYS },
  { days: 7, notice: LicenseNotice.EXPIRES_IN_7_DAYS },
  { days: 1, notice: LicenseNotice.EXPIRES_IN_1_DAY },
];
// Serializes seat checks so concurrent creates cannot overshoot a limit.
export const LICENSE_LIMIT_LOCK_ID = 7_406_213;
