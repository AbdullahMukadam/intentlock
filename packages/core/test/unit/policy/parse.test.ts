import { describe, expect, test } from "vitest";

import { parsePolicy } from "../../../src/policy/parse.js";
import { STARTER_POLICY } from "../../../src/policy/starter.js";

describe("parsePolicy", () => {
  test("parses the starter policy", () => {
    expect(parsePolicy(STARTER_POLICY)).toEqual({
      ok: true,
      policy: {
        version: 1,
        default: "block",
        rules: [{ id: "allow-in-plan", match: { inPlan: true }, decision: "allow" }],
      },
    });
  });

  test("fills hold defaults", () => {
    const result = parsePolicy(`version: 1
default: block
rules:
  - id: hold-it
    match: {}
    decision: hold
    approvers: { roles: [approver] }
`);
    expect(result.ok && result.policy.rules[0]).toEqual({
      id: "hold-it",
      match: {},
      decision: "hold",
      approvers: { roles: ["approver"], emails: [], self: false },
      timeoutSeconds: 300,
    });
  });

  test("reports YAML syntax errors with their line", () => {
    const result = parsePolicy("version: 1\nrules:\n  - id: x\n   bad: [\n");
    expect(!result.ok && result.errors[0]).toMatchObject({ line: 4, col: 1, path: "" });
  });

  test("rejects duplicate YAML keys", () => {
    expect(parsePolicy("version: 1\nversion: 1\ndefault: block\nrules: []").ok).toBe(false);
  });

  test("points schema errors at the offending node", () => {
    const result = parsePolicy(`version: 1
default: block
rules:
  - id: ok-rule
    match: { inPlan: true }
    decision: allow
  - id: bad-rule
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [], emails: [] }
`);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      expect.objectContaining({
        line: 10,
        col: 16,
        path: "rules.1.approvers",
        message: expect.stringMatching(/approver/),
      }),
    ]);
  });

  test("points unknown keys at the key's value", () => {
    const result = parsePolicy(
      "version: 1\ndefault: block\nrules:\n  - id: r\n    match: {}\n    decision: allow\n    reasn: typo\n",
    );
    expect(!result.ok && result.errors[0]).toMatchObject({ line: 7, path: "rules.0.reasn" });
  });

  test("falls back to the parent node for missing keys", () => {
    const result = parsePolicy("version: 1\nrules: []\n");
    expect(!result.ok && result.errors[0]).toMatchObject({ line: 1, col: 1, path: "default" });
  });

  const bomb = [
    "a: &a [x, x, x, x, x, x, x, x, x, x]",
    "b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]",
    "c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]",
    "d: [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]",
  ].join("\n");

  test.each([
    ["default allow", "version: 1\ndefault: allow\nrules: []"],
    [
      "duplicate rule ids",
      "version: 1\ndefault: block\nrules:\n  - { id: a, match: {}, decision: allow }\n  - { id: a, match: {}, decision: block }",
    ],
    [
      "non-kebab rule id",
      "version: 1\ndefault: block\nrules:\n  - { id: Allow_All, match: {}, decision: allow }",
    ],
    [
      "unknown decision",
      "version: 1\ndefault: block\nrules:\n  - { id: a, match: {}, decision: maybe }",
    ],
    [
      "invalid regex",
      'version: 1\ndefault: block\nrules:\n  - { id: a, match: { args: { x: { regex: "(" } } }, decision: allow }',
    ],
    ["empty document", ""],
    ["a list instead of a map", "- a\n- b"],
    ["alias bomb", bomb],
  ])("rejects %s", (_name, source) => {
    expect(parsePolicy(source).ok).toBe(false);
  });
});
