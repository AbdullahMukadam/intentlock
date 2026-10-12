import { canApprove } from "@intentlock/core";

import type { SessionUser } from "../../common/types/auth.types.js";
import { UserRole } from "../../users/enums/user-role.enum.js";
import type { EventAudience } from "../types/event-audience.type.js";

export function canSeeEvent(viewer: SessionUser, audience: EventAudience): boolean {
  if (viewer.orgId !== audience.orgId) return false;
  if (viewer.role !== UserRole.MEMBER) return true;
  if (audience.user === viewer.email) return true;
  return (
    !!audience.approvers &&
    canApprove(audience.approvers, { email: viewer.email, role: viewer.role }, audience.user ?? "")
  );
}
