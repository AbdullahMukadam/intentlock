import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import {
  PolicyMessageSchema,
  PolicySourceSchema,
  PolicyVersionNumberSchema,
} from "../schemas/policy-fields.schema.js";

export class PublishPolicyDto extends zodDto(
  z.strictObject({
    source: PolicySourceSchema,
    baseVersion: PolicyVersionNumberSchema,
    message: PolicyMessageSchema,
  }),
) {}
