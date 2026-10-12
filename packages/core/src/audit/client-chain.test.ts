import { describe, expect, test } from "vitest";

import { ClientEntryKind } from "../enums/client-entry-kind.enum.js";
import { ReportOutcome } from "../enums/report-outcome.enum.js";
import { Verdict } from "../enums/verdict.enum.js";
import { ClientEntry } from "../schemas/audit.js";
import { chainClientEntry, hashClientEntry, type NewClientEntry } from "./client-chain.js";
import { GENESIS } from "./hash-entry.js";

const check = (n: number): NewClientEntry => ({
  planId: "plan_1",
  clientAt: new Date(Date.UTC(2026, 9, 12, 9, 0, n)).toISOString(),
  kind: ClientEntryKind.CHECK,
  token: "t.o.k",
  call: { tool: "github_get_issue", args: { number: n }, callId: `c${n}` },
  decision: { verdict: Verdict.ALLOW, ruleId: "allow-in-plan", planStep: 0 },
  usage: [n - 1],
});

describe("client chain", () => {
  test("numbers entries from 1 and links each to the previous hash", async () => {
    const a = await chainClientEntry(null, check(1));
    const b = await chainClientEntry(a, check(2));
    expect(a).toMatchObject({ clientSeq: 1, prevLocalHash: GENESIS });
    expect(b).toMatchObject({ clientSeq: 2, prevLocalHash: a.localHash });
    expect(ClientEntry.parse(b)).toEqual(b);
  });

  test("any edit changes the hash", async () => {
    const a = await chainClientEntry(null, check(1));
    const { localHash, ...body } = a;
    expect(await hashClientEntry(body)).toBe(localHash);
    const forged = {
      ...body,
      decision: { verdict: Verdict.BLOCK as const, ruleId: null, reason: "x" },
    };
    expect(await hashClientEntry(forged)).not.toBe(localHash);
  });

  test("keys explicitly set to undefined hash like absent keys (JSON round trip safe)", async () => {
    const a = await chainClientEntry(null, {
      ...check(1),
      outcome: undefined as ReportOutcome | undefined,
    });
    const roundTripped = JSON.parse(JSON.stringify(a)) as ClientEntry;
    const { localHash, ...body } = roundTripped;
    expect(await hashClientEntry(body)).toBe(localHash);
  });

  test("hold decisions keep their hold id; unknown fields are rejected", async () => {
    const hold = {
      verdict: Verdict.HOLD as const,
      ruleId: "hold-comments",
      planStep: 0,
      approvers: { roles: ["approver" as const], emails: [], self: false },
      timeoutSeconds: 300,
      holdId: "h1",
    };
    const a = await chainClientEntry(null, { ...check(1), decision: hold });
    expect(ClientEntry.parse(a).decision).toEqual(hold);
    await expect(hashClientEntry({ ...a, extra: 1 } as never)).rejects.toThrow();
  });
});
