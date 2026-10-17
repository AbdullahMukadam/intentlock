import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { EventName } from "../../../src/lib/enums/event-name.enum";
import { EVENT_QUERY_PATHS, invalidatePaths } from "../../../src/lib/live-queries";

const keys = {
  audit: ["api", "/api/v1/audit", "limit=8"],
  auditFiltered: ["api", "/api/v1/audit", "verdict=block"],
  holds: ["api", "/api/v1/holds", "status=pending"],
  run: ["api", "/api/v1/runs/01J", ""],
  stats: ["api", "/api/v1/stats/overview", "from=x"],
  agents: ["api", "/api/v1/agents", ""],
  users: ["api", "/api/v1/users", ""],
  auditLookalike: ["api", "/api/v1/auditx", ""],
};

async function invalidatedBy(event: EventName) {
  const client = new QueryClient();
  for (const key of Object.values(keys)) client.setQueryData(key, {});
  await invalidatePaths(client, EVENT_QUERY_PATHS[event]);
  return Object.entries(keys)
    .filter(([, key]) => client.getQueryState(key)?.isInvalidated)
    .map(([name]) => name)
    .sort();
}

describe("socket events invalidate the queries they change", () => {
  test("a decision refreshes audit (every filter), runs, stats and agent counts", async () => {
    expect(await invalidatedBy(EventName.DECISION)).toEqual(
      ["agents", "audit", "auditFiltered", "run", "stats"].sort(),
    );
  });

  test("a hold created or resolved refreshes holds, audit, runs and stats", async () => {
    const expected = ["audit", "auditFiltered", "holds", "run", "stats"].sort();
    expect(await invalidatedBy(EventName.HOLD_CREATED)).toEqual(expected);
    expect(await invalidatedBy(EventName.HOLD_RESOLVED)).toEqual(expected);
  });

  test("leaves unrelated queries and look-alike paths alone", async () => {
    for (const event of Object.values(EventName)) {
      const hit = await invalidatedBy(event);
      expect(hit).not.toContain("users");
      expect(hit).not.toContain("auditLookalike");
    }
  });
});
