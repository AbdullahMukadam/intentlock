import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { AgentDescriptionSchema, AgentNameSchema } from "../schemas/agent-fields.schema.js";

export class CreateAgentDto extends zodDto(
  z.strictObject({ name: AgentNameSchema, description: AgentDescriptionSchema.optional() }),
) {}
