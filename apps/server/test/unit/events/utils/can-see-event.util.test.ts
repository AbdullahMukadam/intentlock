import { UserRole } from "../../../../src/users/enums/user-role.enum.js";
import { canSeeEvent } from "../../../../src/events/utils/can-see-event.util.js";

const viewer = (role: UserRole, email = "me@t.dev") => ({
  id: "u",
  orgId: "o",
  email,
  role,
  groups: [],
  sessionId: "s",
});

it("shows everything in the org to admins and approvers, never another org", () => {
  expect(canSeeEvent(viewer(UserRole.ADMIN), { orgId: "o", user: "x@t.dev" })).toBe(true);
  expect(canSeeEvent(viewer(UserRole.APPROVER), { orgId: "o", user: "x@t.dev" })).toBe(true);
  expect(canSeeEvent(viewer(UserRole.ADMIN), { orgId: "other", user: "x@t.dev" })).toBe(false);
});

it("shows members their own events and holds they may approve", () => {
  const member = viewer(UserRole.MEMBER);
  expect(canSeeEvent(member, { orgId: "o", user: "me@t.dev" })).toBe(true);
  expect(canSeeEvent(member, { orgId: "o", user: "x@t.dev" })).toBe(false);
  const approvers = { roles: [], emails: ["me@t.dev"], self: false };
  expect(canSeeEvent(member, { orgId: "o", user: "x@t.dev", approvers })).toBe(true);
});
