import { describe, expect, test } from "vitest";

import type { ApproverSpec } from "../schemas/policy.js";
import { canApprove } from "./approvers.js";

const requester = "alice@acme-demo.dev";
const spec = (s: Partial<ApproverSpec>): ApproverSpec => ({
  roles: [],
  emails: [],
  self: false,
  ...s,
});

describe("canApprove", () => {
  test("a user with a listed role may approve", () => {
    expect(
      canApprove(
        spec({ roles: ["approver"] }),
        { email: "bob@acme-demo.dev", role: "approver" },
        requester,
      ),
    ).toBe(true);
    expect(
      canApprove(
        spec({ roles: ["approver"] }),
        { email: "bob@acme-demo.dev", role: "member" },
        requester,
      ),
    ).toBe(false);
  });

  test("a listed email may approve, case-insensitively", () => {
    expect(
      canApprove(
        spec({ emails: ["Lead@Acme-Demo.dev"] }),
        { email: "lead@acme-demo.dev", role: "member" },
        requester,
      ),
    ).toBe(true);
  });

  test("the requester cannot approve their own hold, even with a listed role or email, unless self: true", () => {
    const strict = spec({ roles: ["admin"], emails: [requester] });
    expect(canApprove(strict, { email: requester, role: "admin" }, requester)).toBe(false);
    expect(canApprove(strict, { email: "ALICE@acme-demo.dev", role: "admin" }, requester)).toBe(
      false,
    );
    expect(canApprove(spec({ self: true }), { email: requester, role: "member" }, requester)).toBe(
      true,
    );
  });

  test("self: true does not let other members approve", () => {
    expect(
      canApprove(spec({ self: true }), { email: "bob@acme-demo.dev", role: "member" }, requester),
    ).toBe(false);
  });
});
