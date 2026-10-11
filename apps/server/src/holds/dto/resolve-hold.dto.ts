import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class ResolveHoldDto extends zodDto(
  z.strictObject({ note: z.string().trim().max(1000).optional() }),
) {}
