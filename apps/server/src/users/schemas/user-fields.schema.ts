import { z } from "zod";

import { UserRole } from "../enums/user-role.enum.js";

export const UserRoleSchema = z.enum(UserRole);
export const UserLabelSchema = z
  .string()
  .trim()
  .max(24)
  .transform((v) => (v === "" ? null : v))
  .pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/)
      .nullable(),
  )
  .nullable();
export const UserGroupsSchema = z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(50);
