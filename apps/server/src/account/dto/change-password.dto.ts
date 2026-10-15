import { z } from "zod";

import { Password } from "../../common/schemas/password.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class ChangePasswordDto extends zodDto(
  z.strictObject({
    currentPassword: z.string().min(1).max(200).optional(),
    newPassword: Password,
  }),
) {}
