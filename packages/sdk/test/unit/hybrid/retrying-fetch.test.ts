import { describe, expect, test, vi } from "vitest";

import { retryingFetch } from "../../../src/hybrid/retrying-fetch.js";

describe("retryingFetch (JWKS)", () => {
  test("retries a network error and a 5xx, then returns the answer", async () => {
    const answers: (() => Promise<Response>)[] = [
      () => Promise.reject(new TypeError("fetch failed")),
      async () => new Response("", { status: 503 }),
      async () => Response.json({ keys: [] }),
    ];
    const fetch = vi.fn(() => answers.shift()!());
    const res = await retryingFetch(fetch as unknown as typeof globalThis.fetch)("http://x/jwks");
    expect(await res.json()).toEqual({ keys: [] });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("returns a 4xx at once and gives up after three attempts", async () => {
    const notFound = vi.fn(async () => new Response("", { status: 404 }));
    expect(
      (await retryingFetch(notFound as unknown as typeof globalThis.fetch)("http://x")).status,
    ).toBe(404);
    expect(notFound).toHaveBeenCalledTimes(1);

    const down = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(
      retryingFetch(down as unknown as typeof globalThis.fetch)("http://x"),
    ).rejects.toThrow("fetch failed");
    expect(down).toHaveBeenCalledTimes(3);
  });
});
