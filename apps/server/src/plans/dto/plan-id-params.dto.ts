import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class PlanIdParamsDto extends zodDto(z.object({ id: z.string().min(1).max(64) })) {}
