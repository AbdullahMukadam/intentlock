import { z } from "zod";

import { zodDto } from "../../../common/utils/zod-dto.util.js";

export class CreateApiKeyDto extends zodDto(
  z.strictObject({ name: z.string().trim().min(1).max(64) }),
) {}
