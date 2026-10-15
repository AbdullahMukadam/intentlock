import { z } from "zod";

import { LinkToken } from "../../../common/schemas/password.schema.js";
import { zodDto } from "../../../common/utils/zod-dto.util.js";
import { OAuthMode } from "../enums/oauth-mode.enum.js";

export class OAuthStartQueryDto extends zodDto(
  z
    .strictObject({
      mode: z.enum(OAuthMode).default(OAuthMode.SIGNIN),
      invite: LinkToken.optional(),
    })
    .refine((q) => (q.mode === OAuthMode.INVITE) === (q.invite !== undefined), {
      message: "invite is required with mode=invite and only then",
    }),
) {}
