import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";
import { UserGroups, UserRole } from "../schemas/user-fields.schema.js";

export class CreateUserDto extends zodDto(
  z.object({ email: Email, role: UserRole, groups: UserGroups.default([]) }),
) {}
