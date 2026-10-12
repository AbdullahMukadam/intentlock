import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class OverviewQueryDto extends zodDto(
  z.strictObject({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    agentId: z.string().min(1).max(64).optional(),
  }),
) {}
