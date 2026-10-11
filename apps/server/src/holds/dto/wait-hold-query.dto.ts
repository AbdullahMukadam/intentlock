import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { MAX_WAIT_SECONDS } from "../constants/hold.constants.js";

export class WaitHoldQueryDto extends zodDto(
  z.strictObject({
    timeout: z.coerce.number().int().min(0).max(MAX_WAIT_SECONDS).default(MAX_WAIT_SECONDS),
  }),
) {}
