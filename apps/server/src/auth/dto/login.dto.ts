import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class LoginDto extends zodDto(
  z
    .strictObject({
      email: Email,
      password: z.string().min(1).max(200).optional(),
      token: z.string().min(1).max(200).optional(),
    })
    .refine((b) => (b.password === undefined) !== (b.token === undefined), {
      message: "send either password or token",
    }),
) {}
