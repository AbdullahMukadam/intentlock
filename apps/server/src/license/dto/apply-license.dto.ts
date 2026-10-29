import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { MAX_LICENSE_CHARS } from "../constants/license.constants.js";

export class ApplyLicenseDto extends zodDto(
  z.strictObject({
    key: z.string().trim().min(1).max(MAX_LICENSE_CHARS),
  }),
) {}
