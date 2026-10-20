import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class ListAgentsQueryDto extends zodDto(
  z.strictObject({
    includeDeleted: z.stringbool().optional(),
  }),
) {}
