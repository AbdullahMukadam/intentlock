import { Plan } from "@intentlock/core";

import { unsafeRegexes } from "./unsafe-regexes.util.js";

const plan = (regex: string) =>
  Plan.parse({
    version: 1,
    goal: "g",
    user: "a@b.dev",
    steps: [{ tool: "t", args: { x: { regex } } }],
  });

it("accepts simple patterns and rejects nested quantifiers and very long ones", () => {
  expect(unsafeRegexes(plan("acme-demo/[a-z-]+"))).toEqual([]);
  expect(unsafeRegexes(plan("(a+)+$"))).toEqual(["(a+)+$"]);
  expect(unsafeRegexes(plan("(x*y)*"))).toHaveLength(1);
  expect(unsafeRegexes(plan("a".repeat(300)))).toHaveLength(1);
});
