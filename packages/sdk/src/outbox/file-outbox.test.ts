import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ClientEntryKind, hashClientEntry, type NewClientEntry, Verdict } from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { FileOutbox } from "./file-outbox.js";
import { MemoryOutbox } from "./memory-outbox.js";

const entry = (n: number): NewClientEntry => ({
  planId: "plan1",
  clientAt: new Date(Date.UTC(2026, 9, 12, 9, 0, n)).toISOString(),
  kind: ClientEntryKind.CHECK,
  token: "a.b.c",
  call: { tool: "t", args: { n }, callId: `c${n}` },
  decision: { verdict: Verdict.ALLOW, ruleId: "r", planStep: 0 },
  usage: [n - 1],
});

const dir = () => mkdtemp(join(tmpdir(), "intentlock-outbox-"));

describe("FileOutbox", () => {
  test("appends chained lines and serializes concurrent appends", async () => {
    const d = await dir();
    const outbox = new FileOutbox(d);
    await outbox.recover();
    const written = await Promise.all([1, 2, 3, 4].map((n) => outbox.append("plan1", entry(n))));
    expect(written.map((e) => e.clientSeq)).toEqual([1, 2, 3, 4]);
    const lines = (await readFile(join(d, "plan1.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(lines.map((l) => l.clientSeq)).toEqual([1, 2, 3, 4]);
    for (const [i, line] of lines.entries()) {
      const { localHash, ...body } = line;
      expect(await hashClientEntry(body)).toBe(localHash);
      if (i > 0) expect(line.prevLocalHash).toBe(lines[i - 1].localHash);
    }
    expect(outbox.unackedCount()).toBe(4);
  });

  test("recovers unacked entries, drops a torn last line, and continues the chain", async () => {
    const d = await dir();
    const first = new FileOutbox(d);
    await first.recover();
    for (const n of [1, 2, 3]) await first.append("plan1", entry(n));
    await first.ack("plan1", 1);
    await writeFile(
      join(d, "plan1.jsonl"),
      (await readFile(join(d, "plan1.jsonl"), "utf8")) + '{"planId":"plan1","clie',
    );

    const second = new FileOutbox(d);
    const recovered = await second.recover();
    expect(recovered[0]?.entries.map((e) => e.clientSeq)).toEqual([1, 2, 3]);
    expect(second.pending(10)[0]?.entries.map((e) => e.clientSeq)).toEqual([2, 3]);
    const next = await second.append("plan1", entry(4));
    expect(next.clientSeq).toBe(4);
    expect(next.prevLocalHash).toBe(recovered[0]?.entries[2]?.localHash);
  });

  test("deletes a plan's files once it is complete and fully acked", async () => {
    const d = await dir();
    const outbox = new FileOutbox(d);
    await outbox.recover();
    await outbox.append("plan1", entry(1));
    await outbox.complete("plan1");
    expect((await readdir(d)).sort()).toEqual(["plan1.done", "plan1.jsonl"]);
    await outbox.ack("plan1", 1);
    expect(await readdir(d)).toEqual([]);
  });

  test("tracks the age of the oldest unacked entry", async () => {
    const outbox = new MemoryOutbox();
    expect(outbox.oldestUnackedAt()).toBeNull();
    await outbox.append("plan1", entry(5));
    expect(outbox.oldestUnackedAt()).toBe(Date.parse(entry(5).clientAt));
    await outbox.ack("plan1", 1);
    expect(outbox.oldestUnackedAt()).toBeNull();
  });
});
