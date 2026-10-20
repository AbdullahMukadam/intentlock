import { holdMessage, holdSubject } from "../../../../src/holds/utils/hold-message.util.js";

const base = {
  tool: "github_post_comment",
  user: "bot@acme.dev",
  ruleId: "hold-comments",
  expiresAt: new Date("2026-10-20T10:30:00Z"),
  agent: "tristack-triage",
  link: "https://il.acme.dev/holds",
};

describe("hold message", () => {
  it("names the agent, tool, person, rule and link", () => {
    const text = holdMessage({ ...base, args: { body: "hi" } }, true);
    expect(holdSubject({ ...base, args: {} })).toBe(
      "Approval needed: github_post_comment from tristack-triage",
    );
    expect(text).toContain(
      'Agent "tristack-triage" wants to run github_post_comment for bot@acme.dev',
    );
    expect(text).toContain("Rule: hold-comments");
    expect(text).toContain("https://il.acme.dev/holds");
    expect(text).toContain('Arguments: {"body":"hi"}');
  });

  it("cuts argument values to 500 characters", () => {
    const text = holdMessage({ ...base, args: { body: "x".repeat(2000) } }, true);
    const line = text.split("\n").find((l) => l.startsWith("Arguments: "));
    expect(line).toHaveLength("Arguments: ".length + 501);
    expect(line?.endsWith("…")).toBe(true);
  });

  it("shows only argument names without values", () => {
    const text = holdMessage({ ...base, args: { repo: "a/b", body: "secret" } }, false);
    expect(text).toContain("Argument names: repo, body");
    expect(text).not.toContain("secret");
  });
});
