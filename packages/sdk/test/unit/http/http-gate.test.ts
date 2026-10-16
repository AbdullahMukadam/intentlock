import { describe, expect, test, vi } from "vitest";

import { GateUnavailableError, HttpError } from "../../../src/errors.js";
import { HttpGate } from "../../../src/http/http-gate.js";

const gate = (fetch: (url: string) => Promise<Response>) =>
  new HttpGate({
    baseUrl: "http://x/",
    apiKey: "k",
    fetch: fetch as unknown as typeof globalThis.fetch,
  });

const call = { tool: "t", args: {}, callId: "c" };

describe("HttpGate", () => {
  test("network errors, 5xx and malformed decisions throw GateUnavailableError (callers block)", async () => {
    await expect(
      gate(() => Promise.reject(new Error("ECONNREFUSED"))).check("t", call),
    ).rejects.toBeInstanceOf(GateUnavailableError);
    await expect(
      gate(async () => new Response("", { status: 502 })).check("t", call),
    ).rejects.toBeInstanceOf(GateUnavailableError);
    await expect(
      gate(async () => Response.json({ verdict: "maybe" })).check("t", call),
    ).rejects.toBeInstanceOf(GateUnavailableError);
  });

  test("errors say why: network code, timeout, and the server's code and request id", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNREFUSED" },
    });
    await expect(gate(() => Promise.reject(refused)).check("t", call)).rejects.toThrow(
      "POST /v1/check failed: ECONNREFUSED",
    );
    const slow = new HttpGate({
      baseUrl: "http://x/",
      apiKey: "k",
      timeoutMs: 20,
      fetch: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        )) as unknown as typeof globalThis.fetch,
    });
    await expect(slow.check("t", call)).rejects.toThrow(
      "POST /v1/check failed: timed out after 20 ms",
    );
    await expect(
      gate(async () =>
        Response.json(
          { statusCode: 503, error: "database_unavailable", requestId: "r-9" },
          { status: 503 },
        ),
      ).check("t", call),
    ).rejects.toThrow("POST /v1/check answered 503 (database_unavailable, request r-9)");
    await expect(
      gate(async () => Response.json({ error: "unauthorized" }, { status: 401 })).check("t", call),
    ).rejects.toThrow("Intentlock server answered 401 (unauthorized)");
    await expect(
      gate(async () => new Response("<html>Bad Gateway</html>", { status: 502 })).check("t", call),
    ).rejects.toThrow("POST /v1/check answered 502");
    await expect(
      gate(async () => new Response("<html>ok?</html>", { status: 200 })).check("t", call),
    ).rejects.toThrow("POST /v1/check: unreadable response");
  });

  test("4xx surfaces as HttpError with the server's body", async () => {
    const err = await gate(async () => Response.json({ error: "unauthorized" }, { status: 401 }))
      .check("t", call)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 401, body: { error: "unauthorized" } });
  });

  test("returns the server's decision and sends the API key", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ verdict: "allow", ruleId: "r", planStep: 0 }),
    );
    expect(await gate(fetch).check("tok", call)).toEqual({
      verdict: "allow",
      ruleId: "r",
      planStep: 0,
    });
    expect(fetch.mock.calls[0]![0]).toBe("http://x/v1/check");
    expect(fetch.mock.calls[0]![1]?.headers).toMatchObject({ authorization: "Bearer k" });
  });

  test("refresh posts the token to the plan's refresh route", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) =>
      Response.json({ token: "new", expiresAt: "2026-10-12T10:00:00.000Z" }),
    );
    expect(await gate(fetch).refresh("p/1", "old")).toEqual({
      token: "new",
      expiresAt: "2026-10-12T10:00:00.000Z",
    });
    expect(fetch.mock.calls[0]![0]).toBe("http://x/v1/plans/p%2F1/refresh");
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body))).toEqual({ token: "old" });
  });

  test("waitForHold loops the long-poll until a decision, and expires at its own deadline", async () => {
    const answers = ["pending", "pending", "approved"];
    const fetch = vi.fn(async () => Response.json({ status: answers.shift() }));
    expect(await gate(fetch).waitForHold("h1", { timeoutMs: 60_000 })).toBe("approved");
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(
      await gate(async () => Response.json({ status: "pending" })).waitForHold("h1", {
        timeoutMs: 0,
      }),
    ).toBe("expired");
  });

  test("waitForHold stops when its signal aborts", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      gate(async () => Response.json({ status: "pending" })).waitForHold("h1", {
        timeoutMs: 60_000,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
  });
});
