import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { PolicySourceSchema } from "../schemas/policy-fields.schema.js";

export class ValidatePolicyDto extends zodDto(z.strictObject({ source: PolicySourceSchema })) {}
