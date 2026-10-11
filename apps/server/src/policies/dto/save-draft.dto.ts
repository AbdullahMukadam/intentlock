import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { PolicySourceSchema, PolicyVersionNumberSchema } from "../schemas/policy-fields.schema.js";

export class SaveDraftDto extends zodDto(
  z.strictObject({ source: PolicySourceSchema, baseVersion: PolicyVersionNumberSchema }),
) {}
