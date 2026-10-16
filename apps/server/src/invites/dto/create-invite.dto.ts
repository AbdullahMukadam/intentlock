import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";
import { UserGroupsSchema, UserRoleSchema } from "../../users/schemas/user-fields.schema.js";

export class CreateInviteDto extends zodDto(
  z.strictObject({ email: Email, role: UserRoleSchema, groups: UserGroupsSchema.default([]) }),
) {}
