import { ClientEntry } from "@intentlock/core";
import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { TokenSchema } from "../../plans/schemas/plan-fields.schema.js";
import { MAX_BATCH_ENTRIES, MAX_BATCH_TOKENS } from "../constants/audit.constants.js";

const WireEntry = ClientEntry.omit({ token: true }).extend({ tokenRef: z.number().int().min(0) });

export class AuditBatchDto extends zodDto(
  z
    .strictObject({
      planId: z.string().min(1).max(64),
      tokens: z.array(TokenSchema).min(1).max(MAX_BATCH_TOKENS),
      entries: z.array(WireEntry).min(1).max(MAX_BATCH_ENTRIES),
    })
    .refine((b) => b.entries.every((e) => e.tokenRef < b.tokens.length && e.planId === b.planId), {
      message: "Every entry must belong to planId and reference a sent token",
    }),
) {}
