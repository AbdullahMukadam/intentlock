import { generateSigningKeyPair, parsePolicy } from "@intentlock/core";

import { LocalGate } from "../src/index.js";

const policy = parsePolicy(`version: 1
default: block
rules:
  - id: no-other-repos
    match: { tool: "github_*", args: { repo: { notGlob: "acme-demo/public-app" } } }
    decision: block
    reason: Only acme-demo/public-app is in scope
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`);
if (!policy.ok) throw new Error(JSON.stringify(policy.errors));

const gate = new LocalGate({
  privateKey: (await generateSigningKeyPair()).privateKey,
  policies: policy.policy,
});

const { token, planHash } = await gate.signPlan({
  version: 1,
  goal: "Triage open issues in acme-demo/public-app",
  user: "alice@acme-demo.dev",
  steps: [{ tool: "github_list_issues" }, { tool: "github_get_file_contents" }],
});
console.log(`signed plan ${planHash}\n`);

const calls = [
  ["in plan, in scope", "github_list_issues", "acme-demo/public-app"],
  ["not in plan (injected)", "github_create_pull_request", "acme-demo/public-app"],
  ["in plan, blocked by policy", "github_get_file_contents", "acme-demo/private-notes"],
] as const;

for (const [label, tool, repo] of calls) {
  const decision = await gate.check(token, { tool, args: { repo }, callId: tool });
  const detail =
    decision.verdict === "block"
      ? `${decision.ruleId ?? "-"}: ${decision.reason}`
      : decision.ruleId;
  console.log(
    `${decision.verdict.toUpperCase().padEnd(5)} ${label.padEnd(28)} ${tool}(${repo})  [${detail}]`,
  );
}
