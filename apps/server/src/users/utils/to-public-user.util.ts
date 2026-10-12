import type { User } from "../../generated/prisma/client.js";

export function toPublicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    groups: u.groups,
    disabledAt: u.disabledAt,
    createdAt: u.createdAt,
  };
}
