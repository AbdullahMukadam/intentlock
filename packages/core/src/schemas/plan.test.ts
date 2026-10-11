import { describe, expect, test } from "vitest";

import { PLAN } from "../../test/fixtures/bundle.js";
import { Plan } from "./plan.js";

const step = (s: object) => ({ ...PLAN, steps: [s] });

describe("Plan", () => {
  test("fills step defaults", () => {
    const plan = Plan.parse(step({ tool: "github_list_issues" }));
    expect(plan.steps[0]).toEqual({ tool: "github_list_issues", maxCalls: 20, required: false });
  });

  test.each([
    ["tool name with a dot", step({ tool: "github.list" })],
    ["tool name over 64 chars", step({ tool: "a".repeat(65) })],
    ["invalid regex constraint", step({ tool: "t", args: { a: { regex: "(" } } })],
    ["constraint with two operators", step({ tool: "t", args: { a: { eq: 1, glob: "*" } } })],
    ["negative operator in a plan", step({ tool: "t", args: { a: { notGlob: "*" } } })],
    ["empty in-list", step({ tool: "t", args: { a: { in: [] } } })],
    ["zero maxCalls", step({ tool: "t", maxCalls: 0 })],
    ["no steps", { ...PLAN, steps: [] }],
    ["51 steps", { ...PLAN, steps: Array.from({ length: 51 }, () => ({ tool: "t" })) }],
    ["bad user email", { ...PLAN, user: "alice" }],
    ["goal over 500 chars", { ...PLAN, goal: "x".repeat(501) }],
    ["unknown field", { ...PLAN, extra: true }],
    ["wrong version", { ...PLAN, version: 2 }],
  ])("rejects %s", (_name, input) => {
    expect(Plan.safeParse(input).success).toBe(false);
  });
});
