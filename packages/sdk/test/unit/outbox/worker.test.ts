import { ClientEntryKind, type NewClientEntry, ReportOutcome } from "@intentlock/core";
import { describe, expect, test, vi } from "vitest";

import { HttpClient } from "../../../src/http/client.js";
import { MemoryOutbox } from "../../../src/outbox/memory-outbox.js";
import { backoffMs, OutboxWorker, toWire } from "../../../src/outbox/worker.js";

const entry = (token: string, n: number): NewClientEntry => ({
  planId: "plan1",
  clientAt: new Date().toISOString(),
  kind: ClientEntryKind.REPORT,
  token,
  callId: `c${n}`,
  outcome: ReportOutcome.OK,
});

function server(handler: (body: { entries: { clientSeq: number }[] }) => Response) {
  const calls: unknown[] = [];
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    return handler(body);
  });
  return {
    calls,
    http: new HttpClient({
      baseUrl: "http://x",
      apiKey: "k",
      fetch: fetch as typeof globalThis.fetch,
    }),
  };
}

const acked = (b: { entries: { clientSeq: number }[] }) =>
  Response.json({ ackedThrough: b.entries.at(-1)!.clientSeq, rejected: [] });

describe("OutboxWorker", () => {
  test("sends each token once and points entries at it", async () => {
    const outbox = new MemoryOutbox();
    for (const [t, n] of [
      ["A", 1],
      ["B", 2],
      ["A", 3],
    ] as const)
      await outbox.append("plan1", entry(t, n));
    const wire = toWire("plan1", outbox.pending(10)[0]!.entries);
    expect(wire.tokens).toEqual(["A", "B"]);
    expect(wire.entries.map((e) => e.tokenRef)).toEqual([0, 1, 0]);
    expect(wire.entries[0]).not.toHaveProperty("token");
  });

  test("uploads in batches of maxBatch and acks what the server confirms", async () => {
    const outbox = new MemoryOutbox();
    for (let n = 1; n <= 5; n++) await outbox.append("plan1", entry("A", n));
    const { calls, http } = server(acked);
    const worker = new OutboxWorker(outbox, http, { flushIntervalMs: 60_000, maxBatch: 2 });
    expect(await worker.drain(2_000)).toBe(true);
    expect(calls).toHaveLength(3);
    expect(outbox.unackedCount()).toBe(0);
  });

  test("backs off after a failure and keeps the entries", async () => {
    const outbox = new MemoryOutbox();
    await outbox.append("plan1", entry("A", 1));
    const onError = vi.fn();
    const { calls, http } = server(() => new Response("down", { status: 503 }));
    const worker = new OutboxWorker(outbox, http, {
      flushIntervalMs: 60_000,
      maxBatch: 10,
      onError,
    });
    expect(await worker.flush()).toBe(false);
    expect(await worker.flush()).toBe(false);
    expect(calls).toHaveLength(1);
    expect(onError).toHaveBeenCalledOnce();
    expect(outbox.unackedCount()).toBe(1);
  });

  test("backoff grows exponentially with jitter and caps at 30 s", () => {
    expect(backoffMs(1, () => 1)).toBe(1_000);
    expect(backoffMs(3, () => 1)).toBe(4_000);
    expect(backoffMs(3, () => 0)).toBe(2_000);
    expect(backoffMs(20, () => 1)).toBe(30_000);
  });
});
