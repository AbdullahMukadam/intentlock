import { describe, expect, test } from "vitest";

import { GITHUB_POLICY, policy } from "../../fixtures/bundle.js";
import { evaluatePolicy } from "../../../src/policy/evaluate.js";
import type { MatchContext } from "../../../src/policy/match.js";

const member: MatchContext = {
  user: { email: "alice@acme-demo.dev", role: "member", groups: [] },
  inPlan: true,
};
const intern: MatchContext = { ...member, user: { ...member.user, groups: ["intern"] } };
const call = (tool: string, args: Record<string, unknown> = { repo: "acme-demo/public-app" }) => ({
  tool,
  args,
  callId: "c",
});

describe("evaluatePolicy", () => {
  test("first matching rule wins", () => {
    const privateComment = call("github_post_comment", { repo: "acme-demo/private-notes" });
    expect(evaluatePolicy(GITHUB_POLICY, privateComment, member)?.id).toBe("no-other-repos");
    expect(evaluatePolicy(GITHUB_POLICY, call("github_post_comment"), member)?.id).toBe(
      "hold-public-comments",
    );
  });

  test("except removes calls from a rule's match", () => {
    expect(evaluatePolicy(GITHUB_POLICY, call("github_add_label"), intern)?.id).toBe(
      "interns-read-only",
    );
    expect(evaluatePolicy(GITHUB_POLICY, call("github_get_issue"), intern)?.id).toBe(
      "allow-in-plan",
    );
  });

  test("a tool without the scoped arg is blocked by a notGlob rule (ADR-028)", () => {
    expect(evaluatePolicy(GITHUB_POLICY, call("github_list_repos", {}), member)?.id).toBe(
      "no-other-repos",
    );
  });

  test("returns null (default block) when nothing matches", () => {
    const mailOnly = policy(
      "version: 1\ndefault: block\nrules:\n  - { id: only-mail, match: { tool: mail_* }, decision: allow }",
    );
    expect(evaluatePolicy(mailOnly, call("github_get_issue"), member)).toBeNull();
    expect(
      evaluatePolicy(policy("version: 1\ndefault: block\nrules: []"), call("x"), member),
    ).toBeNull();
  });
});
