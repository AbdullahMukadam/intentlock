import { generateSigningKeyPair, type PolicySet } from "@intentlock/core";
import { FakeProvider } from "@intentlock/guard";
import { beforeAll, describe, expect, test } from "vitest";

import { Domain } from "../../../src/enums/domain.enum.js";
import { GateKind } from "../../../src/enums/gate-kind.enum.js";
import { RunOutcome } from "../../../src/enums/run-outcome.enum.js";
import { loadPolicy } from "../../../src/policies.js";
import { labelFor, makeGate, type RunRecord, runScenario } from "../../../src/runner/run.js";
import { SCENARIOS } from "../../../src/scenarios/index.js";

const KNOWN_GAPS = [
  "gh-006-mass-wontfix",
  "em-002-unrequested-refund",
  "em-004-customer-data-leak",
  "fs-005-overwrite-todo",
];

const policies = new Map<Domain, PolicySet>();
let privateKey: CryptoKey;

beforeAll(async () => {
  for (const d of Object.values(Domain)) policies.set(d, await loadPolicy(d));
  privateKey = (await generateSigningKeyPair()).privateKey;
});

async function scripted(gateKind: GateKind) {
  const records: RunRecord[] = [];
  for (const scenario of SCENARIOS) {
    records.push(
      await runScenario({
        scenario,
        gate: makeGate(gateKind, policies.get(scenario.domain) as PolicySet, privateKey),
        gateKind,
        provider: "scripted",
        run: 1,
      }),
    );
  }
  return records;
}

describe("scripted baseline", { timeout: 30_000 }, () => {
  test("without Intentlock every scripted attack lands and every task is done", async () => {
    const records = await scripted(GateKind.NONE);
    expect(records.every((r) => r.outcome === RunOutcome.FINISHED)).toBe(true);
    expect(
      records.filter((r) => !r.utilityOnly && r.attack !== true).map((r) => r.scenario),
    ).toEqual([]);
    expect(records.filter((r) => !r.task).map((r) => r.scenario)).toEqual([]);
  });

  test("with LocalGate only the known allowed-tool attacks get through and no task is blocked", async () => {
    const records = await scripted(GateKind.LOCAL);
    expect(records.filter((r) => r.attack === true).map((r) => r.scenario)).toEqual(KNOWN_GAPS);
    expect(records.filter((r) => !r.task).map((r) => r.scenario)).toEqual([]);
    expect(records.filter((r) => r.utilityOnly && r.blocked.length > 0)).toEqual([]);
    expect(records.flatMap((r) => r.checkLatenciesMs).length).toBeGreaterThan(100);
  });
});

describe("runScenario", () => {
  test("a provider error is recorded, not thrown", async () => {
    const scenario = SCENARIOS[0];
    if (!scenario) throw new Error("no scenarios");
    const record = await runScenario({
      scenario,
      gate: makeGate(GateKind.NONE, policies.get(scenario.domain) as PolicySet, privateKey),
      gateKind: GateKind.NONE,
      provider: new FakeProvider([]),
      run: 1,
    });
    expect(record).toMatchObject({ outcome: RunOutcome.ERROR, attack: false, task: false });
    expect(record.error).toContain("exhausted");
  });

  test("rate-limit errors are retried, other errors are not", async () => {
    const scenario = SCENARIOS.find((s) => s.id === "gh-u05-label-bug");
    if (!scenario) throw new Error("missing scenario");
    let calls = 0;
    const flaky = new FakeProvider([
      () => {
        calls++;
        throw new Error("429 quota exceeded");
      },
      () => {
        calls++;
        return { text: "Labelled.", toolCalls: [] };
      },
    ]);
    const record = await runScenario({
      scenario,
      gate: makeGate(GateKind.NONE, policies.get(scenario.domain) as PolicySet, privateKey),
      gateKind: GateKind.NONE,
      provider: flaky,
      run: 1,
      retryDelayMs: 0,
    });
    expect(calls).toBe(2);
    expect(record.error ?? "").not.toContain("429");
  });

  test("labelFor splits provider and model", () => {
    expect(
      labelFor({ name: "openai-compatible:gemini-x", chat: async () => ({ toolCalls: [] }) }),
    ).toEqual({
      provider: "openai-compatible",
      model: "gemini-x",
    });
  });

  test("remote gates are only for the latency bench", () => {
    expect(() =>
      makeGate(GateKind.REMOTE, policies.get(Domain.FILES) as PolicySet, privateKey),
    ).toThrow();
  });
});
