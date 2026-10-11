import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";
import { UserGroupsSchema, UserRoleSchema } from "../schemas/user-fields.schema.js";

export class CreateUserDto extends zodDto(
  z.object({ email: Email, role: UserRoleSchema, groups: UserGroupsSchema.default([]) }),
) {}
