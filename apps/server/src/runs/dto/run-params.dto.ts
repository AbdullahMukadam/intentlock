import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class RunParamsDto extends zodDto(z.object({ planId: z.string().min(1).max(64) })) {}
