import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { AgentDescriptionSchema, AgentNameSchema } from "../schemas/agent-fields.schema.js";

export class UpdateAgentDto extends zodDto(
  z.strictObject({
    name: AgentNameSchema.optional(),
    description: AgentDescriptionSchema.nullable().optional(),
    disabled: z.boolean().optional(),
  }),
) {}
