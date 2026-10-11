import { describe, expect, test } from "vitest";

import type { Match } from "../schemas/policy.js";
import { matches, type MatchContext } from "./match.js";

const call = { tool: "github_post_comment", args: { repo: "acme-demo/public-app" }, callId: "c1" };
const ctx: MatchContext = {
  user: { email: "Alice@Acme-Demo.dev", role: "member", groups: ["intern", "oncall"] },
  inPlan: true,
};

describe("matches", () => {
  test.each<[string, Match, boolean]>([
    ["empty match matches everything", {}, true],
    ["tool exact", { tool: "github_post_comment" }, true],
    ["tool glob", { tool: "github_*" }, true],
    ["tool glob miss", { tool: "mail_*" }, false],
    ["tool list hit", { tool: ["mail_send", "github_post_comment"] }, true],
    ["tool list miss", { tool: ["mail_send", "github_get_issue"] }, false],
    ["args hit", { args: { repo: { eq: "acme-demo/public-app" } } }, true],
    ["args miss", { args: { repo: { notGlob: "acme-demo/*" } } }, false],
    ["user email glob, case-insensitive", { user: { email: "*@acme-demo.dev" } }, true],
    ["user email miss", { user: { email: "*@evil.example" } }, false],
    ["user role hit", { user: { role: "member" } }, true],
    ["user role miss", { user: { role: "admin" } }, false],
    ["user group hit", { user: { group: "intern" } }, true],
    ["user group miss", { user: { group: "support-leads" } }, false],
    ["inPlan true", { inPlan: true }, true],
    ["inPlan false", { inPlan: false }, false],
    ["all fields must match", { tool: "github_*", user: { role: "admin" } }, false],
  ])("%s", (_name, match, expected) => {
    expect(matches(match, call, ctx)).toBe(expected);
  });

  test("inPlan false matches an off-plan context", () => {
    expect(matches({ inPlan: false }, call, { ...ctx, inPlan: false })).toBe(true);
  });
});
