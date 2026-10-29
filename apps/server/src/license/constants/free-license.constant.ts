import { LicenseEdition } from "../enums/license-edition.enum.js";
import type { License } from "../schemas/license.schema.js";

export const FREE_LICENSE: License = {
  licensee: "Free",
  edition: LicenseEdition.FREE,
  maxUsers: 5,
  maxAgents: 3,
  retentionDays: 30,
  exp: Infinity,
};
