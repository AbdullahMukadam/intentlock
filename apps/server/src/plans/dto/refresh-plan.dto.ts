import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { TokenSchema } from "../schemas/plan-fields.schema.js";

export class RefreshPlanDto extends zodDto(z.strictObject({ token: TokenSchema })) {}
