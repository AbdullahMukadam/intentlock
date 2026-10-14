import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluatePolicy, parsePolicy, type PolicySet } from "@intentlock/core";
import { beforeAll, expect, test } from "vitest";

import { GithubTool } from "../../src/agents/github/enums/github-tool.enum.js";
import { DemoAgent } from "../../src/enums/demo-agent.enum.js";

let policy: PolicySet;

beforeAll(async () => {
  const file = join(
    import.meta.dirname,
    "..",
    "..",
    "policies",
    `${DemoAgent.GITHUB_ASSISTANT}.yaml`,
  );
  const parsed = parsePolicy(await readFile(file, "utf8"));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  policy = parsed.policy;
});

const decide = (tool: GithubTool, args: Record<string, unknown>) => {
  const rule = evaluatePolicy(
    policy,
    { tool, args, callId: "c1" },
    { user: { email: "alice@acme-demo.dev", role: "member", groups: [] }, inPlan: true },
  );
  return rule ? { decision: rule.decision, id: rule.id } : { decision: "block", id: null };
};

test.each([
  [GithubTool.LIST_ISSUES, { repo: "acme/public-app" }, "allow", "allow-in-plan"],
  [
    GithubTool.ADD_LABEL,
    { repo: "acme/public-app", number: 1, label: "bug" },
    "allow",
    "allow-in-plan",
  ],
  [
    GithubTool.POST_COMMENT,
    { repo: "acme/public-app", number: 1, body: "hi" },
    "hold",
    "hold-public-comments",
  ],
  [
    GithubTool.GET_FILE_CONTENTS,
    { repo: "acme/private-repo", path: "notes.md" },
    "block",
    "only-public-app",
  ],
  [
    GithubTool.GET_FILE_CONTENTS,
    { repo: "acme/public-app", path: "README.md" },
    "allow",
    "allow-in-plan",
  ],
  [GithubTool.LIST_REPOS, {}, "block", "only-public-app"],
  [GithubTool.CREATE_PULL_REQUEST, { repo: "acme/public-app" }, "block", "no-pull-requests"],
  [
    GithubTool.DRAFT_REPLY,
    { repo: "acme/private-repo", number: 1, body: "x" },
    "allow",
    "allow-in-plan",
  ],
])("%s %j → %s (%s), even when in the plan", (tool, args, decision, id) => {
  expect(decide(tool, args)).toEqual({ decision, id });
});
