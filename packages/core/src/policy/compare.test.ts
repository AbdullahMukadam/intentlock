import { expect, test } from "vitest";

import { GITHUB_POLICY, policy } from "../../test/fixtures/bundle.js";
import { compareDecisions, type SampleCall } from "./compare.js";

const alice = { email: "alice@acme-demo.dev", role: "member" as const, groups: [] };
const sample = (tool: string, repo = "acme-demo/public-app"): SampleCall => ({
  call: { tool, args: { repo }, callId: tool },
  user: alice,
});

test("compareDecisions reports per-call outcomes and counts verdict changes", () => {
  const draft = policy(`version: 1
default: block
rules:
  - id: hold-labels
    match: { tool: github_add_label }
    decision: hold
    approvers: { roles: [approver] }
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`);
  const samples = [
    sample("github_get_issue"),
    sample("github_add_label"),
    sample("github_post_comment"),
    sample("github_get_issue", "acme-demo/private-notes"),
    { ...sample("github_get_issue"), inPlan: false },
  ];
  const { results, changed } = compareDecisions(GITHUB_POLICY, draft, samples);

  expect(results.map((r) => [r.from.ruleId, r.to.ruleId])).toEqual([
    ["allow-in-plan", "allow-in-plan"],
    ["allow-in-plan", "hold-labels"],
    ["hold-public-comments", "allow-in-plan"],
    ["no-other-repos", "allow-in-plan"],
    [null, null],
  ]);
  expect(changed).toEqual(
    expect.arrayContaining([
      { from: "allow", to: "hold", count: 1 },
      { from: "hold", to: "allow", count: 1 },
      { from: "block", to: "allow", count: 1 },
    ]),
  );
  expect(changed).toHaveLength(3);
});
