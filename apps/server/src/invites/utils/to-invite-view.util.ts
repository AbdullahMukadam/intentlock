import type { Invite } from "../../generated/prisma/client.js";

export function toInviteView(invite: Invite, invitedBy: string | null) {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    groups: invite.groups,
    invitedBy,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    expired: invite.expiresAt.getTime() <= Date.now(),
  };
}
