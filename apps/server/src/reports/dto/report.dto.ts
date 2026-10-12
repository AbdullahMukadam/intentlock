import { ReportOutcome } from "@intentlock/core";
import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { TokenSchema } from "../../plans/schemas/plan-fields.schema.js";

export class ReportDto extends zodDto(
  z.strictObject({
    token: TokenSchema,
    callId: z.string().min(1).max(200),
    outcome: z.enum(ReportOutcome),
  }),
) {}
