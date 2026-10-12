import { ToolCall } from "@intentlock/core";
import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { TokenSchema } from "../../plans/schemas/plan-fields.schema.js";

export class CreateHoldDto extends zodDto(
  z.strictObject({ token: TokenSchema, call: ToolCall, ruleId: z.string().min(1).max(100) }),
) {}
