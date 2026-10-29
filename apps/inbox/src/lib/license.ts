import { API_ENDPOINTS } from "@intentlock/core";

import { apiUrl } from "./api";
import { LicenseEdition } from "./enums/license-edition.enum";
import { LicenseStatus } from "./enums/license-status.enum";
import type { License } from "./schemas";

export const licenseUrl = apiUrl(API_ENDPOINTS.LICENSE);

export type LimitBreach = { resource: string; used: number; max: number };

export function limitBreaches(license: License): LimitBreach[] {
  const limits = [
    { resource: "users", used: license.usedUsers, max: license.maxUsers },
    { resource: "agents", used: license.usedAgents, max: license.maxAgents },
  ];
  return limits.flatMap(({ resource, used, max }) =>
    max !== null && used > max ? [{ resource, used, max }] : [],
  );
}

export function licenseLabel(license: License) {
  return license.edition === LicenseEdition.FREE ? "Free" : `Licensed to ${license.licensee}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WARN_DAYS = 30;

export function daysUntilExpiry(license: License, now = Date.now()): number | null {
  if (license.status !== LicenseStatus.VALID || !license.expiresAt) return null;
  const days = Math.ceil((Date.parse(license.expiresAt) - now) / DAY_MS);
  return days <= WARN_DAYS ? days : null;
}

export function formatLimit(used: number, max: number | null) {
  return max === null ? `${used} (unlimited)` : `${used} of ${max}`;
}
