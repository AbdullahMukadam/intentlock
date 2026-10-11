import { z } from "zod";

export const UserRole = z.enum(["admin", "approver", "member"]);
export const UserGroups = z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(50);
