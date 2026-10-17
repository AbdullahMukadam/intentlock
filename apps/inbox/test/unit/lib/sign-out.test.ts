import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { signOut } from "../../../src/lib/sign-out";

const client = new QueryClient();

vi.mock("../../../src/lib/query-client", () => ({
  getQueryClient: () => client,
  invalidateAll: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { location: { pathname: "/runs/1", search: "", assign } });
  client.setQueryData(["api", "/api/v1/runs/1", ""], { user: "someone@example.com" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("signOut", () => {
  test("ends the session, empties the cache, then goes to sign in", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await signOut();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/auth/logout");
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(assign).toHaveBeenCalledWith("/login");
  });

  test("empties the cache even when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await signOut();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(assign).toHaveBeenCalledWith("/login");
  });
});
