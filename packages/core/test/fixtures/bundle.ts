import { signBundle } from "../../src/crypto/bundle-token.js";
import { generateSigningKeyPair, keyId, type SigningKeyPair } from "../../src/crypto/keys.js";
import { parsePolicy } from "../../src/policy/parse.js";
import { Plan, type PlanInput } from "../../src/schemas/plan.js";
import type { PolicySet, Role } from "../../src/schemas/policy.js";

export const NOW = new Date("2026-10-12T09:00:00.000Z");

export function policy(yaml: string): PolicySet {
  const result = parsePolicy(yaml);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.policy;
}

export const GITHUB_POLICY = policy(`
version: 1
default: block
rules:
  - id: no-other-repos
    match: { tool: "github_*", args: { repo: { notGlob: "acme-demo/public-app" } } }
    decision: block
    reason: "Only acme-demo/public-app is in scope"
  - id: hold-public-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver, admin] }
    timeoutSeconds: 120
  - id: interns-read-only
    match: { tool: "github_*", user: { group: intern } }
    except: { tool: [github_list_issues, github_get_issue] }
    decision: block
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`);

export const PLAN: PlanInput = {
  version: 1,
  goal: "Triage open issues in acme-demo/public-app",
  user: "alice@acme-demo.dev",
  steps: [
    { tool: "github_list_issues", args: { repo: { eq: "acme-demo/public-app" } } },
    { tool: "github_get_issue", args: { repo: { eq: "acme-demo/public-app" } }, maxCalls: 2 },
    { tool: "github_post_comment", args: { repo: { eq: "acme-demo/public-app" } } },
    { tool: "github_get_file_contents" },
  ],
};

let keys: SigningKeyPair | undefined;
export async function testKeys(): Promise<SigningKeyPair & { kid: string }> {
  keys ??= await generateSigningKeyPair();
  return { ...keys, kid: await keyId(keys.publicKey) };
}

export async function signedToken(
  overrides: {
    plan?: PlanInput;
    policy?: PolicySet;
    role?: Role;
    groups?: string[];
    ttlSeconds?: number;
  } = {},
): Promise<string> {
  const { privateKey, kid } = await testKeys();
  return signBundle(
    {
      planId: "plan_01",
      plan: Plan.parse(overrides.plan ?? PLAN),
      agent: "agent_gh",
      policy: overrides.policy ?? GITHUB_POLICY,
      policyVersion: 3,
      role: overrides.role ?? "member",
      groups: overrides.groups ?? [],
      org: "org_1",
    },
    { privateKey, kid, now: NOW, ttlSeconds: overrides.ttlSeconds },
  );
}
