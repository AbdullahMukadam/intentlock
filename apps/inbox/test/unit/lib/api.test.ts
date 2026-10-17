import { API_ENDPOINTS } from "@intentlock/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { ApiError, api, apiUrl, safeNext } from "../../../src/lib/api";
import { HttpMethod } from "../../../src/lib/enums/http-method.enum";

const fetchMock = vi.fn<typeof fetch>();
const assign = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { location: { pathname: "/holds", search: "", assign } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("apiUrl", () => {
  test("prefixes /api, fills params and drops empty query values", () => {
    expect(
      apiUrl(API_ENDPOINTS.AGENT_API_KEY, {
        params: { id: "a 1", keyId: "k" },
        query: { verdict: "block", user: "", cursor: undefined },
      }),
    ).toBe("/api/v1/agents/a%201/api-keys/k?verdict=block");
  });
});

describe("api", () => {
  test("GET sends no CSRF header and validates the response", async () => {
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    await expect(api(API_ENDPOINTS.HEALTH, z.object({ ok: z.boolean() }))).resolves.toEqual({
      ok: true,
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({});
    expect(init?.credentials).toBe("same-origin");
  });

  test("mutations send the CSRF header and a JSON body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await api(API_ENDPOINTS.HOLD_APPROVE, z.undefined(), {
      method: HttpMethod.POST,
      params: { id: "h1" },
      body: { note: "ok" },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/holds/h1/approve");
    expect(init?.headers).toEqual({ "x-intentlock-csrf": "1", "content-type": "application/json" });
    expect(init?.body).toBe('{"note":"ok"}');
  });

  test("errors carry status and server error code", async () => {
    const body = { statusCode: 409, error: "stale_base_version", activeVersion: 3 };
    fetchMock.mockResolvedValue(json(409, body));
    const error = await api(API_ENDPOINTS.AGENTS, z.unknown()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "stale_base_version", body });
  });

  test("a response that does not match the schema is an ApiError, not a ZodError", async () => {
    fetchMock.mockResolvedValue(json(200, { unexpected: true }));
    const error = await api(API_ENDPOINTS.ME, z.object({ email: z.string() })).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 200, code: "unexpected_response" });
  });

  test("401 sends the user to sign in and back", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "unauthorized" }));
    await expect(api(API_ENDPOINTS.ME, z.unknown())).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("/login?next=%2Fholds");
  });

  test("a failed sign-in or a wrong setup code does not redirect", async () => {
    fetchMock.mockResolvedValue(json(401, { error: "invalid_credentials" }));
    await expect(
      api(API_ENDPOINTS.AUTH_LOGIN, z.unknown(), { method: HttpMethod.POST }),
    ).rejects.toMatchObject({ status: 401, code: "invalid_credentials" });
    fetchMock.mockResolvedValue(json(401, { error: "invalid_setup_code" }));
    await expect(
      api(API_ENDPOINTS.SETUP, z.unknown(), { method: HttpMethod.POST }),
    ).rejects.toMatchObject({ status: 401, code: "invalid_setup_code" });
    expect(assign).not.toHaveBeenCalled();
  });
});

test.each([
  [null, "/"],
  ["/holds?x=1", "/holds?x=1"],
  ["//evil.example", "/"],
  ["/\\evil.example", "/"],
  ["https://evil.example", "/"],
])("safeNext(%s) = %s", (value, expected) => {
  expect(safeNext(value)).toBe(expected);
});
