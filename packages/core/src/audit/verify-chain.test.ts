import { describe, expect, test } from "vitest";

import type { AuditEntry, AuditEntryBody } from "../schemas/audit.js";
import { GENESIS, hashEntry } from "./hash-entry.js";
import { verifyChain } from "./verify-chain.js";

async function chain(n: number): Promise<AuditEntry[]> {
  const entries: AuditEntry[] = [];
  let prevHash = GENESIS;
  for (let seq = 1; seq <= n; seq++) {
    const body: AuditEntryBody = {
      seq,
      orgId: "org_1",
      at: new Date(Date.UTC(2026, 9, 12, 9, 0, seq)).toISOString(),
      kind: "check",
      origin: seq % 2 ? "server" : "client",
      actor: "agent_gh",
      user: "alice@acme-demo.dev",
      planId: "plan_01",
      agentId: "agent_gh",
      tool: "github_get_issue",
      verdict: "allow",
      ruleId: "allow-in-plan",
      policyVersion: 3,
      clientSeq: seq % 2 ? null : seq,
      clientAt: null,
      clientHash: null,
      flagged: null,
      payload: { call: { tool: "github_get_issue", args: { number: seq } } },
      prevHash,
    };
    const hash = await hashEntry(body);
    entries.push({ ...body, hash });
    prevHash = hash;
  }
  return entries;
}

describe("hashEntry", () => {
  test("is deterministic and covers every column, including denormalized ones", async () => {
    const [entry] = await chain(1);
    const { hash, ...body } = entry!;
    expect(await hashEntry(body)).toBe(hash);
    for (const [field, value] of [
      ["verdict", "block"],
      ["ruleId", "no-other-repos"],
      ["flagged", "decision_mismatch"],
      ["agentId", "agent_other"],
      ["clientHash", "x"],
      ["orgId", "org_2"],
      ["origin", "client"],
    ] as const) {
      expect(await hashEntry({ ...body, [field]: value }), field).not.toBe(hash);
    }
  });

  test("rejects entries with unknown fields instead of silently not hashing them", async () => {
    const [entry] = await chain(1);
    const { hash: _hash, ...body } = entry!;
    await expect(hashEntry({ ...body, extra: 1 } as AuditEntryBody)).rejects.toThrow();
  });
});

describe("verifyChain", () => {
  test("intact chain", async () => {
    expect(await verifyChain(await chain(5))).toEqual({ ok: true, count: 5 });
    expect(await verifyChain([])).toEqual({ ok: true, count: 0 });
  });

  test("edited payload is reported at that seq", async () => {
    const entries = await chain(5);
    entries[2] = { ...entries[2]!, payload: { call: { tool: "github_create_pull_request" } } };
    expect(await verifyChain(entries)).toEqual({
      ok: false,
      count: 2,
      firstBrokenSeq: 3,
      reason: "hash_mismatch",
    });
  });

  test("edited denormalized column is reported", async () => {
    const entries = await chain(5);
    entries[3] = { ...entries[3]!, verdict: "block" };
    expect(await verifyChain(entries)).toMatchObject({ ok: false, firstBrokenSeq: 4 });
  });

  test("deleted row is reported at the next entry", async () => {
    const entries = await chain(5);
    entries.splice(1, 1);
    expect(await verifyChain(entries)).toEqual({
      ok: false,
      count: 1,
      firstBrokenSeq: 3,
      reason: "prev_hash_mismatch",
    });
  });

  test("reordered rows are reported", async () => {
    const entries = await chain(5);
    [entries[1], entries[2]] = [entries[2]!, entries[1]!];
    expect(await verifyChain(entries)).toMatchObject({
      ok: false,
      firstBrokenSeq: 3,
      reason: "prev_hash_mismatch",
    });
  });

  test("a recomputed hash on an edited row still breaks the next link", async () => {
    const entries = await chain(5);
    const { hash: _hash, ...body } = { ...entries[1]!, verdict: "block" };
    entries[1] = { ...body, hash: await hashEntry(body) };
    expect(await verifyChain(entries)).toMatchObject({
      ok: false,
      firstBrokenSeq: 3,
      reason: "prev_hash_mismatch",
    });
  });

  test("a malformed entry is reported", async () => {
    const entries: unknown[] = await chain(3);
    entries[1] = { seq: 2, nonsense: true };
    expect(await verifyChain(entries)).toEqual({
      ok: false,
      count: 1,
      firstBrokenSeq: 2,
      reason: "invalid_entry",
    });
    expect(await verifyChain([null])).toMatchObject({ firstBrokenSeq: 1, reason: "invalid_entry" });
  });
});
