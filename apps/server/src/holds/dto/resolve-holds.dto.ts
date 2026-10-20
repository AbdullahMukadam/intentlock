import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { MAX_BULK_HOLDS } from "../constants/hold.constants.js";

export class ResolveHoldsDto extends zodDto(
  z.strictObject({
    ids: z
      .array(z.string().min(1).max(64))
      .min(1)
      .max(MAX_BULK_HOLDS)
      .refine((ids) => new Set(ids).size === ids.length, { message: "ids must be unique" }),
    approve: z.boolean(),
    note: z.string().trim().max(1000).optional(),
  }),
) {}
