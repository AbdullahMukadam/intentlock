import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { Password } from "../../common/schemas/password.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class SetupDto extends zodDto(
  z.strictObject({
    code: z.string().min(1).max(200),
    email: Email,
    password: Password,
    orgName: z.string().trim().min(1).max(100).optional(),
  }),
) {}
