import { z } from "zod";

import { AgentIdSchema } from "../../agents/schemas/agent-fields.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";
import { PolicyVersionNumberSchema } from "../schemas/policy-fields.schema.js";

export class PolicyVersionParamsDto extends zodDto(
  z.object({ id: AgentIdSchema, version: PolicyVersionNumberSchema }),
) {}
