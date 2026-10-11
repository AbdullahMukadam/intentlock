import { SetMetadata } from "@nestjs/common";

import type { Role } from "../../generated/prisma/client.js";
import { ROLES_KEY } from "../constants/auth.constants.js";

/** Session routes limited to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
