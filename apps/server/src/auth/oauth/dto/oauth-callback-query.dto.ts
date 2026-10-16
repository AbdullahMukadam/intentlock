import { z } from "zod";

import { zodDto } from "../../../common/utils/zod-dto.util.js";

export class OAuthCallbackQueryDto extends zodDto(
  z.object({
    code: z.string().max(2000).optional(),
    state: z.string().max(200).optional(),
    error: z.string().max(200).optional(),
  }),
) {}
