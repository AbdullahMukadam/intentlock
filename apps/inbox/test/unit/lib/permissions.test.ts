import { expect, test } from "vitest";

import { UiAction } from "../../../src/lib/enums/ui-action.enum";
import { can } from "../../../src/lib/permissions";

test.each([
  [UiAction.CREATE_AGENT, { admin: true, approver: false, member: false }],
  [UiAction.MANAGE_API_KEYS, { admin: true, approver: false, member: false }],
  [UiAction.EDIT_POLICY, { admin: true, approver: false, member: false }],
  [UiAction.TEST_POLICY, { admin: true, approver: true, member: false }],
])("%s matches the server's @Roles", (action, expected) => {
  expect({
    admin: can("admin", action),
    approver: can("approver", action),
    member: can("member", action),
  }).toEqual(expected);
});
