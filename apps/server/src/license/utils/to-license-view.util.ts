import type { LicenseSource } from "../enums/license-source.enum.js";
import type { LicenseStatus } from "../enums/license-status.enum.js";
import type { License } from "../schemas/license.schema.js";

export function toLicenseView(
  license: License,
  status: LicenseStatus,
  source: LicenseSource,
  usedUsers: number,
  usedAgents: number,
) {
  return {
    edition: license.edition,
    licensee: license.licensee,
    status,
    source,
    maxUsers: license.maxUsers,
    usedUsers,
    maxAgents: license.maxAgents,
    usedAgents,
    retentionDays: license.retentionDays,
    expiresAt: Number.isFinite(license.exp) ? new Date(license.exp * 1000).toISOString() : null,
  };
}
