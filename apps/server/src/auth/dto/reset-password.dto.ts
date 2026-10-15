import { z } from "zod";

import { LinkToken, Password } from "../../common/schemas/password.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class ResetPasswordDto extends zodDto(
  z.strictObject({ token: LinkToken, password: Password }),
) {}
