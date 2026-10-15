import type { IdentityProvider, User } from "../../generated/prisma/client.js";

export function toPublicUser(u: User & { identities?: { provider: IdentityProvider }[] }) {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    groups: u.groups,
    hasPassword: u.passwordHash !== null,
    providers: (u.identities ?? []).map((i) => i.provider),
    disabledAt: u.disabledAt,
    createdAt: u.createdAt,
  };
}
