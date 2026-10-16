import { Role } from "@intentlock/core";

import { UiAction } from "./enums/ui-action.enum";

const ALLOWED: Record<UiAction, Role[]> = {
  [UiAction.CREATE_AGENT]: [Role.enum.admin],
  [UiAction.MANAGE_API_KEYS]: [Role.enum.admin],
  [UiAction.EDIT_POLICY]: [Role.enum.admin],
  [UiAction.TEST_POLICY]: [Role.enum.admin, Role.enum.approver],
  [UiAction.MANAGE_TEAM]: [Role.enum.admin],
};

export function can(role: Role, action: UiAction) {
  return ALLOWED[action].includes(role);
}
