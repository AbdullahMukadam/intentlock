import { DAY_MS, LICENSE_EXPIRY_NOTICES } from "../constants/license.constants.js";
import type { LicenseNotice } from "../enums/license-notice.enum.js";

export function dueExpiryNotice(exp: number, now: Date): LicenseNotice | null {
  const daysLeft = (exp * 1000 - now.getTime()) / DAY_MS;
  if (daysLeft <= 0) return null;
  const due = LICENSE_EXPIRY_NOTICES.filter((n) => daysLeft <= n.days).at(-1);
  return due?.notice ?? null;
}
