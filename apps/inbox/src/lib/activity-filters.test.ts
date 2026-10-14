import { expect, test } from "vitest";

import { parseFilters, toAuditQuery } from "./activity-filters";

test("parseFilters keeps known params, trims, takes the first of repeats", () => {
  expect(
    parseFilters({ tool: " github_get_issue ", verdict: ["block", "allow"], other: "x" }),
  ).toEqual({
    agentId: "",
    user: "",
    tool: "github_get_issue",
    verdict: "block",
    ruleId: "",
    policyVersion: "",
    from: "",
    to: "",
    q: "",
  });
});

test("toAuditQuery turns datetime-local values into ISO and drops invalid ones", () => {
  const query = toAuditQuery({ ...parseFilters({}), from: "2026-10-13T05:30", to: "nope" });
  expect(query.from).toBe(new Date("2026-10-13T05:30").toISOString());
  expect(query.to).toBeUndefined();
});
