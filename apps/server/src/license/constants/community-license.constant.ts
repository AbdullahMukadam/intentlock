import { LicenseEdition } from "../enums/license-edition.enum.js";
import type { License } from "../schemas/license.schema.js";

export const COMMUNITY_LICENSE: License = {
  licensee: "Community",
  edition: LicenseEdition.COMMUNITY,
  maxUsers: 5,
  maxAgents: 3,
  retentionDays: 30,
  features: [],
  exp: Infinity,
};
