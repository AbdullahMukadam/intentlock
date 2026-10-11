import { describe, expect, test } from "vitest";

import { NOW, PLAN, policy, signedToken, testKeys } from "../test/fixtures/bundle.js";
import { check, decide } from "./check.js";
import { verifyBundle } from "./crypto/bundle-token.js";
import { generateSigningKeyPair } from "./crypto/keys.js";
import type { BundleClaims } from "./schemas/bundle.js";
import { Decision } from "./schemas/decision.js";
import type { PolicySet } from "./schemas/policy.js";

const PUBLIC = "acme-demo/public-app";
const call = (tool: string, args: Record<string, unknown> = { repo: PUBLIC }) => ({
  tool,
  args,
  callId: `${tool}-1`,
});

async function bundle(overrides: Parameters<typeof signedToken>[0] = {}): Promise<BundleClaims> {
  return verifyBundle(await signedToken(overrides), (await testKeys()).publicKey, NOW);
}

describe("check (ARCHITECTURE §4)", () => {
  test("allow: in plan, under the limit, allowed by policy", async () => {
    expect(
      check(await bundle(), call("github_get_issue", { repo: PUBLIC, number: 3 }), []),
    ).toEqual({
      verdict: "allow",
      ruleId: "allow-in-plan",
      planStep: 1,
    });
  });

  test("not_in_plan: tool missing from the plan, even if policy would allow it", async () => {
    expect(check(await bundle(), call("github_create_pull_request"), [])).toEqual({
      verdict: "block",
      ruleId: null,
      reason: "not_in_plan",
    });
  });

  test("not_in_plan: pinned arg differs (injected repo)", async () => {
    expect(
      check(await bundle(), call("github_get_issue", { repo: "acme-demo/private-notes" }), []),
    ).toMatchObject({
      reason: "not_in_plan",
    });
  });

  test("call_limit: step maxCalls reached", async () => {
    expect(check(await bundle(), call("github_get_issue"), [0, 2])).toEqual({
      verdict: "block",
      ruleId: null,
      reason: "call_limit",
    });
  });

  test("an exhausted step falls through to another matching step with capacity", async () => {
    const plan = {
      ...PLAN,
      steps: [
        { tool: "github_get_issue", maxCalls: 1 },
        { tool: "github_get_issue", maxCalls: 5 },
      ],
    };
    expect(check(await bundle({ plan }), call("github_get_issue"), [1, 0])).toMatchObject({
      verdict: "allow",
      planStep: 1,
    });
  });

  test("policy block: rule id and the rule's reason", async () => {
    expect(
      check(
        await bundle(),
        call("github_get_file_contents", { repo: "acme-demo/private-notes" }),
        [],
      ),
    ).toEqual({
      verdict: "block",
      ruleId: "no-other-repos",
      reason: "Only acme-demo/public-app is in scope",
    });
  });

  test("policy block without a reason gets a default one", async () => {
    const pol = policy(
      "version: 1\ndefault: block\nrules:\n  - { id: no-files, match: { tool: github_get_file_contents }, decision: block }",
    );
    expect(check(await bundle({ policy: pol }), call("github_get_file_contents"), [])).toEqual({
      verdict: "block",
      ruleId: "no-files",
      reason: "Blocked by rule no-files",
    });
  });

  test("hold: approvers and timeout from the rule", async () => {
    expect(check(await bundle(), call("github_post_comment"), [])).toEqual({
      verdict: "hold",
      ruleId: "hold-public-comments",
      planStep: 2,
      approvers: { roles: ["approver", "admin"], emails: [], self: false },
      timeoutSeconds: 120,
    });
  });

  test("user group rules use the bundle's groups", async () => {
    const plan = { ...PLAN, steps: [...PLAN.steps, { tool: "github_add_label" }] };
    expect(
      check(await bundle({ plan, groups: ["intern"] }), call("github_add_label"), []),
    ).toMatchObject({
      verdict: "block",
      ruleId: "interns-read-only",
    });
    expect(check(await bundle({ plan }), call("github_add_label"), [])).toMatchObject({
      verdict: "allow",
    });
  });

  test("no_matching_rule: policy default block", async () => {
    const pol = policy("version: 1\ndefault: block\nrules: []");
    expect(check(await bundle({ policy: pol }), call("github_get_issue"), [])).toEqual({
      verdict: "block",
      ruleId: null,
      reason: "no_matching_rule",
    });
  });

  test("internal_error: anything that throws is a block", async () => {
    const b = await bundle();
    const throwing = {
      ...b.pol,
      rules: [
        {
          id: "boom",
          decision: "allow",
          get match(): never {
            throw new Error("policy exploded");
          },
        },
      ],
    } as unknown as PolicySet;
    expect(check({ ...b, pol: throwing }, call("github_get_issue"), [])).toEqual({
      verdict: "block",
      ruleId: null,
      reason: "internal_error",
    });
  });
});

test("every decision conforms to the Decision schema", async () => {
  const b = await bundle();
  const calls = [
    call("github_get_issue"),
    call("github_post_comment"),
    call("github_create_pull_request"),
    call("github_get_file_contents", { repo: "acme-demo/private-notes" }),
  ];
  for (const c of calls) expect(Decision.safeParse(check(b, c, [0, 2])).success).toBe(true);
});

describe("decide", () => {
  test("verifies the token, checks the call and counts allows and holds", async () => {
    const { publicKey } = await testKeys();
    const token = await signedToken();
    const usage: number[] = [];
    expect(await decide(token, publicKey, call("github_get_issue"), usage, NOW)).toMatchObject({
      verdict: "allow",
    });
    expect(await decide(token, publicKey, call("github_post_comment"), usage, NOW)).toMatchObject({
      verdict: "hold",
    });
    expect(await decide(token, publicKey, call("github_list_repos", {}), usage, NOW)).toMatchObject(
      { verdict: "block" },
    );
    expect(usage).toEqual([undefined, 1, 1]);
  });

  test("concurrent calls cannot overshoot maxCalls", async () => {
    const { publicKey } = await testKeys();
    const token = await signedToken();
    const usage: number[] = [];
    const decisions = await Promise.all(
      Array.from({ length: 5 }, () =>
        decide(token, publicKey, call("github_get_issue"), usage, NOW),
      ),
    );
    expect(decisions.filter((d) => d.verdict === "allow")).toHaveLength(2);
    expect(
      decisions.filter((d) => d.verdict === "block" && d.reason === "call_limit"),
    ).toHaveLength(3);
    expect(usage[1]).toBe(2);
  });

  test("bad signature → invalid_token; expired → token_expired", async () => {
    const other = await generateSigningKeyPair();
    const token = await signedToken({ ttlSeconds: 60 });
    expect(await decide(token, other.publicKey, call("github_get_issue"), [], NOW)).toEqual({
      verdict: "block",
      ruleId: null,
      reason: "invalid_token",
    });
    const later = new Date(NOW.getTime() + 120_000);
    expect(
      await decide(token, (await testKeys()).publicKey, call("github_get_issue"), [], later),
    ).toMatchObject({
      reason: "token_expired",
    });
    expect(
      await decide("not.a.token", other.publicKey, call("github_get_issue"), [], NOW),
    ).toMatchObject({
      reason: "invalid_token",
    });
  });

  test("malformed call → invalid_call, before touching the token", async () => {
    const { publicKey } = await testKeys();
    for (const bad of [
      null,
      { tool: "x" },
      { tool: 1, args: {}, callId: "c" },
      { tool: "x", args: [], callId: "c" },
    ]) {
      expect(await decide("irrelevant", publicKey, bad, [], NOW)).toMatchObject({
        reason: "invalid_call",
      });
    }
  });
});
