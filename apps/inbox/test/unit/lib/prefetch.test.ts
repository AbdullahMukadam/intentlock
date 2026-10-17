import { Role } from "@intentlock/core";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, test, vi } from "vitest";

import { pageQueryUrls, prefetchPage } from "../../../src/lib/prefetch";
import { queryKeyFor } from "../../../src/lib/query-client";
import { statsWindow } from "../../../src/lib/stats-window";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("statsWindow", () => {
  test("is the same within five minutes, so the overview's stats come from the cache", () => {
    const day = 24 * 60 * 60 * 1000;
    const at = Date.UTC(2026, 9, 17, 12, 0, 0);
    expect(statsWindow(day, at + 4 * 60 * 1000)).toEqual(statsWindow(day, at));
    expect(statsWindow(day, at)).toEqual({
      from: "2026-10-16T12:00:00.000Z",
      prevFrom: "2026-10-15T12:00:00.000Z",
    });
    expect(statsWindow(day, at + 5 * 60 * 1000)).not.toEqual(statsWindow(day, at));
  });
});

describe("pageQueryUrls", () => {
  test("lists the requests each sidebar page makes on first render", () => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 17, 12, 2, 0) });
    expect(pageQueryUrls("/", Role.enum.admin)).toEqual([
      "/api/v1/agents",
      "/api/v1/stats/overview?from=2026-10-16T12%3A00%3A00.000Z",
      "/api/v1/stats/overview?from=2026-10-15T12%3A00%3A00.000Z&to=2026-10-16T12%3A00%3A00.000Z",
      "/api/v1/audit?limit=8",
    ]);
    expect(pageQueryUrls("/activity", Role.enum.member)).toEqual([
      "/api/v1/agents",
      "/api/v1/audit",
    ]);
    expect(pageQueryUrls("/holds", Role.enum.member)).toEqual([
      "/api/v1/agents",
      "/api/v1/holds?status=pending",
    ]);
    expect(pageQueryUrls("/audit", Role.enum.admin)).toEqual([]);
  });

  test("only admins prefetch invites, the same as the team page", () => {
    expect(pageQueryUrls("/team", Role.enum.admin)).toEqual(["/api/v1/users", "/api/v1/invites"]);
    expect(pageQueryUrls("/team", Role.enum.member)).toEqual(["/api/v1/users"]);
  });
});

describe("prefetchPage", () => {
  test("fills the cache under the page's query keys and skips data that is still fresh", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ agents: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });
    prefetchPage(client, "/agents", Role.enum.admin);
    await vi.waitFor(() =>
      expect(client.getQueryData(queryKeyFor("/api/v1/agents"))).toEqual({ agents: [] }),
    );
    prefetchPage(client, "/agents", Role.enum.admin);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
