import { describe, expect, test } from "vitest";

import { planFromFile } from "../../src/plan-file.js";

describe("planFromFile", () => {
  test("adds the version and the user", () => {
    const plan = planFromFile(
      JSON.stringify({
        goal: "Triage",
        steps: [{ tool: "list_issues", args: { repo: { eq: "acme/app" } } }],
      }),
      "sam@acme.dev",
    );
    expect(plan).toMatchObject({ version: 1, user: "sam@acme.dev", goal: "Triage" });
  });

  test("rejects bad JSON, unknown fields and invalid tool names", () => {
    expect(() => planFromFile("{", "sam@acme.dev")).toThrow(/not valid JSON/);
    expect(() =>
      planFromFile(
        JSON.stringify({ goal: "x", steps: [{ tool: "a" }], user: "evil@x.dev" }),
        "sam@acme.dev",
      ),
    ).toThrow(/Invalid plan file/);
    expect(() =>
      planFromFile(JSON.stringify({ goal: "x", steps: [{ tool: "a.b" }] }), "sam@acme.dev"),
    ).toThrow();
    expect(() => planFromFile(JSON.stringify({ goal: "x", steps: [] }), "sam@acme.dev")).toThrow();
  });
});
