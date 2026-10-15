import { z } from "zod";

import { LinkToken } from "../../common/schemas/password.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class InviteTokenDto extends zodDto(z.strictObject({ token: LinkToken })) {}
