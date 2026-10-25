import { z } from "zod";

import { LicenseEdition } from "../enums/license-edition.enum.js";

export const LicenseSchema = z.object({
  licensee: z.string().min(1),
  edition: z.enum(LicenseEdition),
  maxUsers: z.number().int().positive().nullable(),
  maxAgents: z.number().int().positive().nullable(),
  retentionDays: z.number().int().positive(),
  exp: z.number(),
});
export type License = z.infer<typeof LicenseSchema>;
