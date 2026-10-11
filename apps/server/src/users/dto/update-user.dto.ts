import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { UserGroups, UserRole } from "../schemas/user-fields.schema.js";

export class UpdateUserDto extends zodDto(
  z.strictObject({
    role: UserRole.optional(),
    groups: UserGroups.optional(),
    disabled: z.boolean().optional(),
  }),
) {}
