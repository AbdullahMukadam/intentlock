import { describe, expect, test } from "vitest";

import type { ArgCondition, PlanStep } from "../../../src/schemas/plan.js";
import { matchArg, matchStep } from "../../../src/plan/match-step.js";

const args = {
  repo: "acme-demo/public-app",
  path: ".github/workflows/ci.yml",
  amount: 20,
  nan: Number.NaN,
  labels: ["bug", "p1"],
  nil: null,
  undef: undefined,
  numeric: "20",
};

describe("matchArg", () => {
  test.each<[string, ArgCondition, string, boolean]>([
    ["eq string", { eq: "acme-demo/public-app" }, "repo", true],
    ["eq other string", { eq: "acme-demo/private-notes" }, "repo", false],
    ["eq array", { eq: ["bug", "p1"] }, "labels", true],
    ["eq array order matters", { eq: ["p1", "bug"] }, "labels", false],
    ["eq null", { eq: null }, "nil", true],
    ["eq does not coerce types", { eq: 20 }, "numeric", false],
    ["in hit", { in: ["x", "acme-demo/public-app"] }, "repo", true],
    ["in miss", { in: ["x"] }, "repo", false],
    ["notIn miss", { notIn: ["x"] }, "repo", true],
    ["notIn hit", { notIn: ["acme-demo/public-app"] }, "repo", false],
    ["glob within segment", { glob: "acme-demo/*" }, "repo", true],
    ["glob * does not cross /", { glob: "acme-*" }, "repo", false],
    ["glob matches dotfiles", { glob: "**/*.yml" }, "path", true],
    ["glob ! is literal, not negation", { glob: "!acme-demo/public-app" }, "repo", false],
    ["notGlob outside", { notGlob: "acme-demo/private-*" }, "repo", true],
    ["notGlob inside", { notGlob: "acme-demo/*" }, "repo", false],
    ["regex full match", { regex: "acme-demo/[a-z-]+" }, "repo", true],
    ["regex substring is not enough", { regex: "public" }, "repo", false],
    ["regex alternation stays anchored", { regex: "x|acme-demo/public-app" }, "repo", true],
    ["lte inside", { lte: 20 }, "amount", true],
    ["lte outside", { lte: 19.99 }, "amount", false],
    ["gte inside", { gte: 20 }, "amount", true],
    ["gte outside", { gte: 21 }, "amount", false],
    ["lte rejects numeric strings", { lte: 100 }, "numeric", false],
    ["gte rejects NaN", { gte: 0 }, "nan", false],
    ["glob rejects non-strings", { glob: "*" }, "amount", false],
    ["regex rejects non-strings", { regex: ".*" }, "labels", false],
  ])("%s", (_name, cond, key, expected) => {
    expect(matchArg(cond, args, key)).toBe(expected);
  });

  // ADR-028: missing (or undefined) args fail positive operators and satisfy negative ones.
  test.each<[ArgCondition, boolean]>([
    [{ eq: null }, false],
    [{ in: [null] }, false],
    [{ glob: "*" }, false],
    [{ regex: ".*" }, false],
    [{ lte: 1e9 }, false],
    [{ gte: -1e9 }, false],
    [{ notIn: ["x"] }, true],
    [{ notGlob: "*" }, true],
  ])("missing arg: %j → %s", (cond, expected) => {
    expect(matchArg(cond, args, "missing")).toBe(expected);
    expect(matchArg(cond, args, "undef")).toBe(expected);
  });

  test("values that cannot be canonicalized never equal anything", () => {
    expect(matchArg({ eq: 1 }, { big: 1n }, "big")).toBe(false);
  });

  test("ignores inherited properties", () => {
    expect(matchArg({ eq: {} }, args, "constructor")).toBe(false);
    expect(matchArg({ notGlob: "*" }, args, "toString")).toBe(true);
  });
});

describe("matchStep", () => {
  const call = {
    tool: "github_get_issue",
    args: { repo: "acme-demo/public-app", number: 3 },
    callId: "c1",
  };
  const step = (s: Partial<PlanStep>): PlanStep => ({
    tool: "github_get_issue",
    maxCalls: 1,
    required: false,
    ...s,
  });

  test("matches tool name exactly and every pinned arg", () => {
    expect(matchStep(step({}), call)).toBe(true);
    expect(
      matchStep(
        step({ args: { repo: { eq: "acme-demo/public-app" }, number: { lte: 10 } } }),
        call,
      ),
    ).toBe(true);
  });

  test("fails on another tool, a glob tool name, a mismatched arg or a missing pinned arg", () => {
    expect(matchStep(step({ tool: "github_get_issues" }), call)).toBe(false);
    expect(matchStep(step({ tool: "github_*" }), call)).toBe(false);
    expect(matchStep(step({ args: { repo: { eq: "acme-demo/private-notes" } } }), call)).toBe(
      false,
    );
    expect(matchStep(step({ args: { label: { glob: "*" } } }), call)).toBe(false);
  });
});
