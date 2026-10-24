import { describe, expect, test } from "vitest";

import { parsePolicy } from "../../../src/policy/parse.js";
import { STARTER_POLICY } from "../../../src/policy/starter.js";
import { policyToYaml, yamlExtras } from "../../../src/policy/to-yaml.js";
import type { PolicySet } from "../../../src/schemas/policy.js";

function parsed(source: string): PolicySet {
  const result = parsePolicy(source);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.policy;
}

const EVERY_SHAPE = `version: 1
default: block
rules:
  - id: no-destructive
    match: { tool: [github_delete_repo, shell_exec] }
    decision: block
    reason: Never delete
  - id: only-our-repos
    match:
      tool: "github_*"
      args:
        repo: { notGlob: "acme/*" }
        owner: { notIn: [evil, other] }
    decision: block
  - id: hold-big-refunds
    match:
      tool: refund
      args:
        amountUsd: { gte: 100 }
        currency: { in: [usd, eur] }
      user: { role: member, group: support }
    except: { user: { email: lead@acme.dev } }
    decision: hold
    approvers: { roles: [approver, admin], emails: [cfo@acme.dev], self: true }
    timeoutSeconds: 600
  - id: small-refunds
    match:
      tool: refund
      args:
        amountUsd: { lte: 99.5 }
        note: { regex: "^ok" }
        dryRun: { eq: false }
        count: { eq: 3 }
        label: { eq: "needs triage" }
        path: { glob: "docs/**" }
    decision: allow
  - id: off-plan
    match: { inPlan: false }
    decision: block
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

describe("policyToYaml", () => {
  test("round-trips every rule type, argument condition and match field", () => {
    const policy = parsed(EVERY_SHAPE);
    const yaml = policyToYaml(policy);
    expect(parsed(yaml)).toEqual(policy);
    expect(policyToYaml(parsed(yaml))).toBe(yaml);
  });

  test("writes the standard layout: block rules, flow match/approvers, defaults left out", () => {
    const yaml = policyToYaml(
      parsed(`version: 1
default: block
rules:
  - decision: hold
    match: { tool: github_post_comment }
    id: hold-comments
    approvers: { roles: [approver] }
    timeoutSeconds: 300
`),
    );
    expect(yaml).toBe(`version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [ approver ] }
    timeoutSeconds: 300
`);
  });

  test("the starter policy comes back unchanged", () => {
    expect(parsed(policyToYaml(parsed(STARTER_POLICY)))).toEqual(parsed(STARTER_POLICY));
  });

  test("an empty match is kept so the rule still matches everything", () => {
    const policy = parsed(
      "version: 1\ndefault: block\nrules:\n  - id: all\n    match: {}\n    decision: block\n",
    );
    expect(parsed(policyToYaml(policy))).toEqual(policy);
  });
});

describe("yamlExtras", () => {
  test("plain YAML has none", () => {
    expect(yamlExtras(EVERY_SHAPE)).toEqual({ comments: false, anchors: false });
  });

  test("finds comments anywhere and anchors or aliases", () => {
    expect(yamlExtras(`# top\n${STARTER_POLICY}`).comments).toBe(true);
    expect(
      yamlExtras(STARTER_POLICY.replace("decision: allow", "decision: allow # why")).comments,
    ).toBe(true);
    const anchored = `version: 1
default: block
rules:
  - id: a
    match: &m { tool: x }
    decision: block
  - id: b
    match: *m
    decision: allow
`;
    expect(yamlExtras(anchored)).toEqual({ comments: false, anchors: true });
  });
});
