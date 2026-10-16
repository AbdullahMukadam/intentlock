import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";

export class ForgotPasswordDto extends zodDto(z.strictObject({ email: Email })) {}
