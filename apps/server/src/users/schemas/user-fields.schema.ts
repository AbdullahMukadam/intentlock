import { z } from "zod";

import { UserRole } from "../enums/user-role.enum.js";

export const UserRoleSchema = z.enum(UserRole);
export const UserGroupsSchema = z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(50);
