import { API_ENDPOINTS } from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { ApiError, apiUrl } from "../../../src/lib/api";
import { createQueryClient, queryKeyFor, shouldRetry } from "../../../src/lib/query-client";

describe("queryKeyFor", () => {
  test("keys a query by endpoint path and query string", () => {
    expect(queryKeyFor(apiUrl(API_ENDPOINTS.AUDIT, { query: { limit: 8 } }))).toEqual([
      "api",
      "/api/v1/audit",
      "limit=8",
    ]);
    expect(queryKeyFor(apiUrl(API_ENDPOINTS.AGENTS))).toEqual(["api", "/api/v1/agents", ""]);
  });

  test("gives the same URL the same key, so one request serves every component", () => {
    const url = apiUrl(API_ENDPOINTS.HOLDS, { query: { status: "pending" } });
    expect(queryKeyFor(url)).toEqual(queryKeyFor(url));
  });
});

describe("shouldRetry", () => {
  test("never retries a 4xx", () => {
    for (const status of [400, 401, 403, 404, 409, 429]) {
      expect(shouldRetry(0, new ApiError(status, "x"))).toBe(false);
    }
  });

  test("retries network errors and 5xx up to three times", () => {
    for (const error of [
      new TypeError("fetch failed"),
      new ApiError(503, "database_unavailable"),
    ]) {
      expect([0, 1, 2, 3].map((n) => shouldRetry(n, error))).toEqual([true, true, true, false]);
    }
  });
});

describe("createQueryClient", () => {
  const cached = ["api", "/api/v1/runs", ""];

  test("clears every cached query on a 401", async () => {
    const client = createQueryClient();
    client.setQueryData(cached, { runs: ["someone else's"] });
    await client
      .fetchQuery({
        queryKey: ["api", "/api/v1/me", ""],
        queryFn: () => Promise.reject(new ApiError(401, "unauthorized")),
      })
      .catch(() => undefined);
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });

  test("keeps the cache on other errors", async () => {
    const client = createQueryClient();
    client.setQueryData(cached, { runs: [] });
    await client
      .fetchQuery({
        queryKey: ["api", "/api/v1/me", ""],
        queryFn: () => Promise.reject(new ApiError(404, "not_found")),
      })
      .catch(() => undefined);
    expect(client.getQueryData(cached)).toEqual({ runs: [] });
  });
});
