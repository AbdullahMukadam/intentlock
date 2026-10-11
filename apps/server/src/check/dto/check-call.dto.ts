import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { TokenSchema } from "../../plans/schemas/plan-fields.schema.js";

// The call is validated inside the check so a malformed one becomes a recorded block, not a 400.
export class CheckCallDto extends zodDto(
  z.strictObject({ token: TokenSchema, call: z.unknown() }),
) {}
