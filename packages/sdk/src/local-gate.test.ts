import {
  generateSigningKeyPair,
  parsePolicy,
  type PlanInput,
  type PolicySet,
} from "@intentlock/core";
import { beforeAll, describe, expect, test } from "vitest";

import { LocalGate } from "./local-gate.js";
import { PassThroughGate } from "./passthrough-gate.js";

const POLICY_YAML = `version: 1
default: block
rules:
  - id: no-other-repos
    match: { tool: "github_*", args: { repo: { notGlob: "acme-demo/public-app" } } }
    decision: block
    reason: Only acme-demo/public-app is in scope
  - id: hold-public-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
  - id: interns-read-only
    match: { tool: "github_*", user: { group: intern } }
    except: { tool: [github_get_issue] }
    decision: block
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

function parsed(yaml: string): PolicySet {
  const result = parsePolicy(yaml);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.policy;
}

const PLAN: PlanInput = {
  version: 1,
  goal: "Triage issue 3",
  user: "alice@acme-demo.dev",
  steps: [
    { tool: "github_get_issue", maxCalls: 2 },
    { tool: "github_add_label" },
    { tool: "github_post_comment" },
    { tool: "github_get_file_contents" },
  ],
};

const call = (tool: string, repo = "acme-demo/public-app") => ({
  tool,
  args: { repo },
  callId: tool,
});

let privateKey: CryptoKey;
beforeAll(async () => {
  privateKey = (await generateSigningKeyPair()).privateKey;
});

describe("LocalGate", () => {
  test("signs a plan and allows in-plan calls", async () => {
    const gate = new LocalGate({ privateKey, policies: parsed(POLICY_YAML) });
    const signed = await gate.signPlan(PLAN);
    expect(signed).toMatchObject({ policyVersion: 1, token: expect.stringMatching(/^ey/) });
    expect(Date.parse(signed.expiresAt) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(await gate.check(signed.token, call("github_get_issue"))).toEqual({
      verdict: "allow",
      ruleId: "allow-in-plan",
      planStep: 0,
    });
  });

  test("blocks off-plan calls and policy-blocked calls", async () => {
    const gate = new LocalGate({ privateKey, policies: parsed(POLICY_YAML) });
    const { token } = await gate.signPlan(PLAN);
    expect(await gate.check(token, call("github_create_pull_request"))).toMatchObject({
      reason: "not_in_plan",
    });
    expect(
      await gate.check(token, call("github_get_file_contents", "acme-demo/private-notes")),
    ).toMatchObject({
      verdict: "block",
      ruleId: "no-other-repos",
    });
  });

  test("turns holds into blocks, since there is no server to approve them", async () => {
    const gate = new LocalGate({ privateKey, policies: parsed(POLICY_YAML) });
    const { token } = await gate.signPlan(PLAN);
    expect(await gate.check(token, call("github_post_comment"))).toEqual({
      verdict: "block",
      ruleId: "hold-public-comments",
      reason: "hold_requires_server",
    });
    expect(await gate.waitForHold()).toBe("rejected");
  });

  test("counts calls per plan", async () => {
    const gate = new LocalGate({ privateKey, policies: parsed(POLICY_YAML) });
    const a = await gate.signPlan(PLAN);
    const b = await gate.signPlan(PLAN);
    expect(a.planId).not.toBe(b.planId);
    await gate.check(a.token, call("github_get_issue"));
    await gate.check(a.token, call("github_get_issue"));
    expect(await gate.check(a.token, call("github_get_issue"))).toMatchObject({
      reason: "call_limit",
    });
    expect(await gate.check(b.token, call("github_get_issue"))).toMatchObject({ verdict: "allow" });
  });

  test("uses roles and groups from the users map and refuses unknown users", async () => {
    const gate = new LocalGate({
      privateKey,
      policies: parsed(POLICY_YAML),
      users: { "Alice@acme-demo.dev": { role: "member", groups: ["intern"] } },
    });
    const { token } = await gate.signPlan(PLAN);
    expect(await gate.check(token, call("github_add_label"))).toMatchObject({
      ruleId: "interns-read-only",
    });
    expect(await gate.check(token, call("github_get_issue"))).toMatchObject({ verdict: "allow" });
    await expect(gate.signPlan({ ...PLAN, user: "mallory@evil.example" })).rejects.toThrow(
      /Unknown user/,
    );
  });

  test("blocks expired tokens and tokens from another gate's key", async () => {
    let now = new Date("2026-10-12T09:00:00Z");
    const gate = new LocalGate({
      privateKey,
      policies: parsed(POLICY_YAML),
      now: () => now,
      ttlSeconds: 60,
    });
    const other = new LocalGate({
      privateKey: (await generateSigningKeyPair()).privateKey,
      policies: parsed(POLICY_YAML),
    });
    const { token } = await gate.signPlan(PLAN);
    expect(await other.check(token, call("github_get_issue"))).toMatchObject({
      reason: "invalid_token",
    });
    now = new Date(now.getTime() + 120_000);
    expect(await gate.check(token, call("github_get_issue"))).toMatchObject({
      reason: "token_expired",
    });
  });

  test("rejects an invalid policy and an invalid plan up front", async () => {
    expect(
      () =>
        new LocalGate({
          privateKey,
          policies: { version: 1, default: "allow", rules: [] } as never,
        }),
    ).toThrow();
    const gate = new LocalGate({ privateKey, policies: parsed(POLICY_YAML) });
    await expect(gate.signPlan({ ...PLAN, steps: [] })).rejects.toThrow();
  });
});

describe("PassThroughGate", () => {
  test("allows everything (unprotected baseline)", async () => {
    const gate = new PassThroughGate();
    const { token } = await gate.signPlan(PLAN);
    expect(await gate.check()).toEqual({ verdict: "allow", ruleId: "passthrough", planStep: -1 });
    expect(token).toBe("passthrough");
    expect(await gate.waitForHold()).toBe("approved");
    await gate.report();
    await gate.close();
  });
});
