import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { PolicyMessageSchema, PolicyVersionNumberSchema } from "../schemas/policy-fields.schema.js";

export class RollbackPolicyDto extends zodDto(
  z.strictObject({ toVersion: PolicyVersionNumberSchema, message: PolicyMessageSchema }),
) {}
