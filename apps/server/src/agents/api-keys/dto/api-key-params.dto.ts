import { z } from "zod";

import { zodDto } from "../../../common/utils/zod-dto.util.js";
import { AgentIdSchema } from "../../schemas/agent-fields.schema.js";

export class ApiKeyParamsDto extends zodDto(
  z.object({ id: AgentIdSchema, keyId: z.string().min(1).max(64) }),
) {}
