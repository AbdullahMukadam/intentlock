import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class LoginDto extends zodDto(
  z.object({ email: Email, token: z.string().min(1).max(200) }),
) {}
