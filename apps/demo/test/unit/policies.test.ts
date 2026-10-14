import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { evaluatePolicy, parsePolicy, type PolicySet, type Role } from "@intentlock/core";
import { beforeAll, describe, expect, test } from "vitest";

import { FilesTool } from "../../src/agents/files/enums/files-tool.enum.js";
import { GithubTool } from "../../src/agents/github/enums/github-tool.enum.js";
import { SupportTool } from "../../src/agents/support/enums/support-tool.enum.js";
import { loadOrders } from "../../src/agents/support/orders.js";
import { DemoAgent } from "../../src/enums/demo-agent.enum.js";

const policies = new Map<DemoAgent, PolicySet>();

beforeAll(async () => {
  for (const agent of Object.values(DemoAgent)) {
    const file = join(import.meta.dirname, "..", "..", "policies", `${agent}.yaml`);
    const parsed = parsePolicy(await readFile(file, "utf8"));
    if (!parsed.ok) throw new Error(`${agent}: ${JSON.stringify(parsed.errors)}`);
    policies.set(agent, parsed.policy);
  }
});

const MEMBER = { role: "member" as Role, groups: [] as string[] };

const decide = (
  agent: DemoAgent,
  tool: string,
  args: Record<string, unknown>,
  user: { role: Role; groups: string[] } = MEMBER,
) => {
  const policy = policies.get(agent);
  if (!policy) throw new Error(`no policy for ${agent}`);
  const rule = evaluatePolicy(
    policy,
    { tool, args, callId: "c1" },
    { user: { email: "alice@acme-demo.dev", ...user }, inPlan: true },
  );
  return rule ? { decision: rule.decision, id: rule.id } : { decision: "block", id: null };
};

describe(DemoAgent.GITHUB_ASSISTANT, () => {
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
    expect(decide(DemoAgent.GITHUB_ASSISTANT, tool, args)).toEqual({ decision, id });
  });
});

describe(DemoAgent.SUPPORT_ASSISTANT, () => {
  const refund = (customer: string, amountUsd: number) => ({
    customer,
    orderId: "A-1002",
    amountUsd,
    reason: "r",
  });
  const INTERN = { role: "member" as Role, groups: ["intern"] };
  const LEAD = { role: "member" as Role, groups: ["support-leads"] };

  test.each([
    [SupportTool.MAIL_LIST, {}, MEMBER, "allow", "allow-in-plan"],
    [SupportTool.MAIL_REPLY, { id: "m1", body: "hi" }, MEMBER, "allow", "allow-in-plan"],
    [
      SupportTool.MAIL_FORWARD,
      { id: "m1", to: "attacker@evil.example" },
      MEMBER,
      "block",
      "forward-inside-only",
    ],
    [
      SupportTool.MAIL_FORWARD,
      { id: "m1", to: "evil@acme-demo.dev.evil.example" },
      MEMBER,
      "block",
      "forward-inside-only",
    ],
    [SupportTool.MAIL_FORWARD, { id: "m1" }, MEMBER, "block", "forward-inside-only"],
    [
      SupportTool.MAIL_FORWARD,
      { id: "m1", to: "ops@acme-demo.dev" },
      MEMBER,
      "allow",
      "allow-in-plan",
    ],
    [SupportTool.REFUND_ISSUE, refund("sam@example.com", 5), MEMBER, "allow", "small-refunds"],
    [SupportTool.REFUND_ISSUE, refund("sam@example.com", 20), MEMBER, "allow", "small-refunds"],
    [SupportTool.REFUND_ISSUE, refund("dana@example.com", 200), MEMBER, "hold", "hold-refunds"],
    [
      SupportTool.REFUND_ISSUE,
      refund("dana@example.com", 200),
      LEAD,
      "allow",
      "leads-refund-up-to-limit",
    ],
    [
      SupportTool.REFUND_ISSUE,
      refund("dana@example.com", 200),
      INTERN,
      "block",
      "interns-no-refunds",
    ],
    [SupportTool.REFUND_ISSUE, refund("sam@example.com", 5), INTERN, "block", "interns-no-refunds"],
    [SupportTool.REFUND_ISSUE, refund("lee@example.com", 600), LEAD, "block", "refund-limit"],
    [
      SupportTool.REFUND_ISSUE,
      refund("attacker@evil.example", 5),
      LEAD,
      "block",
      "refund-known-accounts",
    ],
    [
      SupportTool.REFUND_ISSUE,
      { customer: "sam@example.com", orderId: "A-1001", amountUsd: "5" },
      MEMBER,
      "block",
      "refund-limit",
    ],
  ])("%s %j as %j → %s (%s)", (tool, args, user, decision, id) => {
    expect(decide(DemoAgent.SUPPORT_ASSISTANT, tool, args, user)).toEqual({ decision, id });
  });

  test("refund-known-accounts lists exactly the customers in orders.json", () => {
    const rule = policies
      .get(DemoAgent.SUPPORT_ASSISTANT)
      ?.rules.find((r) => r.id === "refund-known-accounts");
    const customers = rule?.except?.args?.customer;
    const listed = customers && "in" in customers ? customers.in : [];
    expect([...listed].sort()).toEqual([...new Set(loadOrders().map((o) => o.customer))].sort());
  });
});

describe(DemoAgent.FILES_ASSISTANT, () => {
  test.each([
    [FilesTool.FS_LIST, { path: "workspace" }, "allow", "allow-in-plan"],
    [FilesTool.FS_READ, { path: "workspace/todo.md" }, "allow", "allow-in-plan"],
    [FilesTool.FS_WRITE, { path: "workspace/summary.md", content: "x" }, "allow", "allow-in-plan"],
    [FilesTool.FS_READ, { path: ".env" }, "block", "no-env-files"],
    [FilesTool.FS_READ, { path: "workspace/.env.local" }, "block", "no-env-files"],
    [FilesTool.FS_READ, { path: "workspace/../.env" }, "block", "workspace-only"],
    [FilesTool.FS_READ, { path: "workspace/../secrets.txt" }, "block", "workspace-only"],
    [FilesTool.FS_READ, { path: "./workspace/todo.md" }, "block", "workspace-only"],
    [FilesTool.FS_READ, { path: "workspace-old/a.md" }, "block", "workspace-only"],
    [FilesTool.FS_READ, {}, "block", "workspace-only"],
    [FilesTool.FS_LIST, { path: "." }, "block", "workspace-only"],
    [FilesTool.HTTP_REQUEST, { url: "https://example.com" }, "allow", "allow-in-plan"],
  ])("%s %j → %s (%s)", (tool, args, decision, id) => {
    expect(decide(DemoAgent.FILES_ASSISTANT, tool, args)).toEqual({ decision, id });
  });
});
