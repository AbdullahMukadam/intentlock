import {
  API_ENDPOINTS,
  generateSigningKeyPair,
  keyId,
  parsePolicy,
  Plan,
  type PlanInput,
  publicJwk,
  ReportOutcome,
  signBundle,
  Verdict,
} from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { HybridGate } from "../../../src/hybrid/hybrid-gate.js";

const BASE = "https://intentlock.test/api";
const PLAN: PlanInput = {
  version: 1,
  user: "bot@acme.dev",
  goal: "Triage",
  steps: [{ tool: "get_issue", required: true }, { tool: "search" }, { tool: "add_label" }],
};

type WireEntry = { clientSeq: number; prevLocalHash: string; localHash: string; usage?: number[] };

async function fakeServer() {
  const { privateKey, publicKey } = await generateSigningKeyPair();
  const parsed = parsePolicy(
    "version: 1\ndefault: block\nrules:\n  - id: allow-in-plan\n    match: { inPlan: true }\n    decision: allow\n",
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const entries: WireEntry[] = [];
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  const fetchImpl: typeof fetch = async (input, init) => {
    const path = String(input).slice(BASE.length);
    if (path === API_ENDPOINTS.JWKS) return json({ keys: [await publicJwk(publicKey)] });
    if (path === API_ENDPOINTS.PLANS) {
      const token = await signBundle(
        {
          planId: "plan1",
          plan: Plan.parse(PLAN),
          agent: "bot",
          policy: parsed.policy,
          policyVersion: 1,
          role: "member",
          groups: [],
          org: "org1",
        },
        { privateKey, kid: await keyId(publicKey), now: new Date() },
      );
      return json({ planId: "plan1", token });
    }
    if (path === API_ENDPOINTS.AUDIT_BATCH) {
      const batch = JSON.parse(String(init?.body)) as { entries: WireEntry[] };
      entries.push(...batch.entries);
      return json({ ackedThrough: batch.entries.at(-1)?.clientSeq ?? 0 });
    }
    return new Response("not found", { status: 404 });
  };
  return { fetchImpl, entries };
}

async function setup() {
  const server = await fakeServer();
  const errors: unknown[] = [];
  const gate = new HybridGate({
    baseUrl: BASE,
    apiKey: "il_live_test",
    outboxDir: null,
    handleSignals: false,
    fetch: server.fetchImpl,
    onError: (err) => errors.push(err),
  });
  const { token } = await gate.signPlan(PLAN);
  return { ...server, errors, gate, token };
}

describe("HybridGate audit entries", () => {
  test("usage snapshots stay dense when plan steps are used out of order", async () => {
    const t = await setup();
    const verdicts = [];
    for (const [i, tool] of ["get_issue", "add_label", "get_issue"].entries()) {
      verdicts.push((await t.gate.check(t.token, { tool, args: {}, callId: `c${i}` })).verdict);
    }
    await t.gate.close();
    expect(t.errors).toEqual([]);
    expect(verdicts).toEqual([Verdict.ALLOW, Verdict.ALLOW, Verdict.ALLOW]);
    expect(t.entries.map((e) => e.usage)).toEqual([[], [1], [1, 0, 1]]);
  });

  test("the chain continues after the required steps have run", async () => {
    const t = await setup();
    for (const [i, tool] of ["get_issue", "add_label"].entries()) {
      await t.gate.check(t.token, { tool, args: {}, callId: `c${i}` });
      await t.gate.report(t.token, `c${i}`, ReportOutcome.OK);
    }
    await t.gate.close();
    expect(t.errors).toEqual([]);
    expect(t.entries.map((e) => e.clientSeq)).toEqual([1, 2, 3, 4]);
    for (const [i, e] of t.entries.entries()) {
      if (i > 0) expect(e.prevLocalHash).toBe(t.entries[i - 1]?.localHash);
    }
  });
});

describe("HybridGate pause and resume", () => {
  test("a new gate that imports the exported state continues the client chain and usage", async () => {
    const t = await setup();
    await t.gate.check(t.token, { tool: "get_issue", args: {}, callId: "c0" });
    await t.gate.check(t.token, { tool: "search", args: {}, callId: "c1" });
    const state = await t.gate.exportPlan("plan1");
    await t.gate.close();
    expect(state).toMatchObject({ chain: { clientSeq: 2 }, usage: [1, 1], decisions: 2 });

    const next = new HybridGate({
      baseUrl: BASE,
      apiKey: "il_live_test",
      outboxDir: null,
      handleSignals: false,
      fetch: t.fetchImpl,
    });
    await next.importPlan("plan1", JSON.parse(JSON.stringify(state)));
    await next.check(t.token, { tool: "search", args: {}, callId: "c2" });
    await next.close();
    expect(t.entries.map((e) => e.clientSeq)).toEqual([1, 2, 3]);
    expect(t.entries[2]!.prevLocalHash).toBe(t.entries[1]!.localHash);
    expect(t.entries[2]!.usage).toEqual([1, 1]);
  });

  test("an invalid state is refused", async () => {
    const t = await setup();
    await expect(t.gate.importPlan("plan1", { chain: "x" })).rejects.toThrow(/Invalid gate state/);
    await t.gate.close();
  });

  test("holdInfo asks the wait route without waiting and validates the answer", async () => {
    const info = {
      status: "approved",
      planId: "plan1",
      callId: "c1",
      tool: "add_label",
      args: { label: "bug" },
    };
    const seen: string[] = [];
    const answer = (body: unknown) => async (input: string | URL | Request) => {
      seen.push(String(input).slice(BASE.length));
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
      });
    };
    const gate = (fetchImpl: typeof fetch) =>
      new HybridGate({
        baseUrl: BASE,
        apiKey: "k",
        outboxDir: null,
        handleSignals: false,
        fetch: fetchImpl,
      });
    expect(await gate(answer(info) as typeof fetch).holdInfo("h1")).toEqual(info);
    expect(seen).toEqual(["/v1/holds/h1/wait?timeout=0"]);
    await expect(
      gate(answer({ status: "approved" }) as typeof fetch).holdInfo("h1"),
    ).rejects.toThrow(/Malformed hold/);
  });
});
