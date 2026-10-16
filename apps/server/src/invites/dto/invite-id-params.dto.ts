import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class InviteIdParamsDto extends zodDto(z.object({ id: z.string().min(1).max(64) })) {}
