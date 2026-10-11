import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { PlanSchema } from "../schemas/plan-fields.schema.js";

export class SignPlanDto extends zodDto(z.strictObject({ plan: PlanSchema })) {}
