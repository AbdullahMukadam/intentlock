import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";

export class UpdateAccountDto extends zodDto(z.strictObject({ holdEmails: z.boolean() })) {}
