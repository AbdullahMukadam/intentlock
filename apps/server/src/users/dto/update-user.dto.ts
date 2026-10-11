import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { UserGroupsSchema, UserRoleSchema } from "../schemas/user-fields.schema.js";

export class UpdateUserDto extends zodDto(
  z.strictObject({
    role: UserRoleSchema.optional(),
    groups: UserGroupsSchema.optional(),
    disabled: z.boolean().optional(),
  }),
) {}
