import { Verdict } from "@intentlock/core";

import { decisionsAgree } from "./decisions-agree.util.js";

const allow = (ruleId = "allow-in-plan") => ({
  verdict: Verdict.ALLOW as const,
  ruleId,
  planStep: 0,
});
const hold = (ruleId = "hold-comments") => ({
  verdict: Verdict.HOLD as const,
  ruleId,
  planStep: 0,
  approvers: { roles: [], emails: ["a@b.dev"], self: false },
  timeoutSeconds: 60,
});
const blocked = (reason: string, ruleId: string | null = null) => ({
  verdict: Verdict.BLOCK as const,
  ruleId,
  reason,
});

it("accepts identical decisions and any stricter client decision", () => {
  expect(decisionsAgree(allow(), allow())).toBe(true);
  expect(decisionsAgree(blocked("not_in_plan"), blocked("not_in_plan"))).toBe(true);
  expect(decisionsAgree(blocked("server_unavailable"), allow())).toBe(true);
  expect(decisionsAgree(blocked("invalid_token"), blocked("Blocked", "no-other-repos"))).toBe(true);
  expect(decisionsAgree({ ...hold(), holdId: "h" }, allow())).toBe(true);
});

it("flags a client that is looser than the policy or cites another allowing rule", () => {
  expect(decisionsAgree(allow(), blocked("not_in_plan"))).toBe(false);
  expect(decisionsAgree(allow(), hold())).toBe(false);
  expect(decisionsAgree({ ...hold(), holdId: "h" }, blocked("call_limit"))).toBe(false);
  expect(decisionsAgree(allow("other"), allow())).toBe(false);
  expect(decisionsAgree({ ...hold("other"), holdId: "h" }, hold())).toBe(false);
});
