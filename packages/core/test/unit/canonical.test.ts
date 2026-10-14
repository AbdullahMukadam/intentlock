import { describe, expect, test } from "vitest";

import { jcs, planHash, policyHash, sha256Base64url } from "../../src/canonical.js";
import { Plan } from "../../src/schemas/plan.js";
import { GITHUB_POLICY, PLAN } from "../fixtures/bundle.js";

describe("jcs", () => {
  test("sorts keys and drops whitespace (RFC 8785)", () => {
    expect(jcs({ b: 1, a: [true, null, "x"], c: { z: 1.0, y: 1e21 } })).toBe(
      '{"a":[true,null,"x"],"b":1,"c":{"y":1e+21,"z":1}}',
    );
  });

  test("rejects values JSON cannot represent", () => {
    expect(() => jcs(undefined)).toThrow(TypeError);
  });
});

test("sha256Base64url matches the known SHA-256 of 'abc'", async () => {
  expect(await sha256Base64url("abc")).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0");
});

describe("planHash", () => {
  const plan = Plan.parse(PLAN);

  test("is stable across key order and whitespace", async () => {
    const reordered = JSON.parse(
      JSON.stringify({ steps: plan.steps, user: plan.user, goal: plan.goal, version: 1 }, null, 4),
    );
    expect(await planHash(reordered)).toBe(await planHash(plan));
  });

  test("changes when any value changes", async () => {
    const base = await planHash(plan);
    const changedArg = structuredClone(plan);
    changedArg.steps[0]!.args = { repo: { eq: "acme-demo/private-notes" } };
    const changedLimit = structuredClone(plan);
    changedLimit.steps[1]!.maxCalls = 3;
    expect(await planHash({ ...plan, user: "bob@acme-demo.dev" })).not.toBe(base);
    expect(await planHash(changedArg)).not.toBe(base);
    expect(await planHash(changedLimit)).not.toBe(base);
  });
});

test("policyHash changes with the policy", async () => {
  const other = { ...GITHUB_POLICY, rules: GITHUB_POLICY.rules.slice(1) };
  expect(await policyHash(other)).not.toBe(await policyHash(GITHUB_POLICY));
});
