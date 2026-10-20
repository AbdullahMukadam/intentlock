import { HoldResolveOutcome } from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { HoldState } from "../../../src/lib/enums/hold-state.enum";
import { bulkSummary } from "../../../src/lib/hold-bulk";
import { matchesHold, parseHoldFilters } from "../../../src/lib/hold-filters";
import type { HoldView } from "../../../src/lib/schemas";

const hold: HoldView = {
  id: "h1",
  planId: "p1",
  agentId: "a1",
  args: { repo: "acme/web", body: "Ship it" },
  callId: "c1",
  tool: "github_post_comment",
  user: "dev@acme.test",
  ruleId: "hold-comments",
  status: "pending",
  resolvedBy: null,
  note: null,
  createdAt: "2026-10-20T00:00:00Z",
  resolvedAt: null,
  expiresAt: "2026-10-20T01:00:00Z",
};

describe("hold filters", () => {
  test("parses the URL and defaults to pending", () => {
    expect(parseHoldFilters({})).toEqual({ q: "", agentId: "", state: HoldState.PENDING });
    expect(parseHoldFilters({ q: " ship ", agentId: "a1", state: "expired" })).toEqual({
      q: "ship",
      agentId: "a1",
      state: HoldState.EXPIRED,
    });
    expect(parseHoldFilters({ state: "bogus" }).state).toBe(HoldState.PENDING);
  });

  test("searches tool, agent, person, rule and arguments, case-insensitively", () => {
    const f = (q: string, agentId = "") => ({ q, agentId, state: HoldState.PENDING });
    for (const q of [
      "POST_COMMENT",
      "triage",
      "dev@acme",
      "hold-comments",
      "ship it",
      "acme/web",
    ]) {
      expect(matchesHold(hold, f(q), "triage-bot")).toBe(true);
    }
    expect(matchesHold(hold, f("delete"), "triage-bot")).toBe(false);
    expect(matchesHold(hold, f("", "a2"))).toBe(false);
    expect(matchesHold(hold, f("", "a1"))).toBe(true);
  });

  test("summarises a bulk result with skip reasons", () => {
    expect(
      bulkSummary(
        {
          results: [
            { id: "1", outcome: HoldResolveOutcome.APPROVED },
            { id: "2", outcome: HoldResolveOutcome.EXPIRED },
            { id: "3", outcome: HoldResolveOutcome.EXPIRED },
            { id: "4", outcome: HoldResolveOutcome.NOT_PENDING },
          ],
          resolved: 1,
          skipped: 3,
        },
        true,
      ),
    ).toBe("Approved 1, skipped 3 (2 expired, 1 already resolved)");
    expect(bulkSummary({ results: [], resolved: 0, skipped: 0 }, false)).toBe("Rejected 0");
  });
});
