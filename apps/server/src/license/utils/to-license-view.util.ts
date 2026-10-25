import type { License } from "../schemas/license.schema.js";

export function toLicenseView(license: License, usedUsers: number, usedAgents: number) {
  return {
    edition: license.edition,
    licensee: license.licensee,
    maxUsers: license.maxUsers,
    usedUsers,
    maxAgents: license.maxAgents,
    usedAgents,
    retentionDays: license.retentionDays,
    expiresAt: Number.isFinite(license.exp) ? new Date(license.exp * 1000).toISOString() : null,
  };
}
