import { setTimeout as sleep } from "node:timers/promises";

import { type PolicySet, Role } from "@intentlock/core";
import {
  createGuard,
  EventType,
  FakeProvider,
  type GuardEvent,
  type LLMProvider,
  toolset,
} from "@intentlock/guard";
import { type Gate, LocalGate, PassThroughGate } from "@intentlock/sdk";

import { GateKind } from "../enums/gate-kind.enum.js";
import { RunOutcome } from "../enums/run-outcome.enum.js";
import type { RunTrace, Scenario } from "../scenario.js";
import { SCRIPTED_MODEL, SCRIPTED_PROVIDER, scriptedSteps } from "./scripted.js";

export const EVAL_USER = "member@acme-demo.dev";
const MAX_TURNS = 15;

export interface RunRecord {
  scenario: string;
  domain: string;
  utilityOnly: boolean;
  gate: GateKind;
  provider: string;
  model: string;
  run: number;
  outcome: RunOutcome;
  attack: boolean | null;
  task: boolean;
  blocked: string[];
  checkLatenciesMs: number[];
  inputTokens: number;
  outputTokens: number;
  turns: number;
  error?: string;
}

export function labelFor(provider: LLMProvider) {
  const [kind = provider.name, ...rest] = provider.name.split(":");
  return { provider: kind, model: rest.join(":") || kind };
}

const RETRYABLE = /\b(429|503)\b/;
const MAX_RETRIES = 4;
export const DEFAULT_RETRY_DELAY_MS = 20_000;

async function withRetries<T>(call: () => Promise<T>, delayMs: number): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (attempt > MAX_RETRIES || !RETRYABLE.test(message)) throw err;
      await sleep(delayMs * attempt);
    }
  }
}

function metered(provider: LLMProvider, delayMs: number, retryDelayMs: number) {
  const usage = { inputTokens: 0, outputTokens: 0 };
  const wrapped: LLMProvider = {
    name: provider.name,
    chat: async (req) => {
      if (delayMs) await sleep(delayMs);
      const res = await withRetries(() => provider.chat(req), retryDelayMs);
      usage.inputTokens += res.usage?.inputTokens ?? 0;
      usage.outputTokens += res.usage?.outputTokens ?? 0;
      return res;
    },
  };
  return { wrapped, usage };
}

export function makeGate(kind: GateKind, policy: PolicySet, privateKey: CryptoKey): Gate {
  if (kind === GateKind.NONE) return new PassThroughGate();
  if (kind === GateKind.LOCAL) {
    return new LocalGate({
      privateKey,
      policies: policy,
      users: { [EVAL_USER]: { role: Role.enum.member } },
    });
  }
  throw new Error(`Scenario runs use ${GateKind.NONE} or ${GateKind.LOCAL}, not ${kind}`);
}

export interface RunOptions {
  scenario: Scenario;
  gate: Gate;
  gateKind: GateKind;
  provider: LLMProvider | "scripted";
  run: number;
  delayMs?: number;
  retryDelayMs?: number;
}

export async function runScenario(opts: RunOptions): Promise<RunRecord> {
  const { scenario } = opts;
  const base =
    opts.provider === "scripted" ? new FakeProvider(scriptedSteps(scenario)) : opts.provider;
  const label =
    opts.provider === "scripted"
      ? { provider: SCRIPTED_PROVIDER, model: SCRIPTED_MODEL }
      : labelFor(opts.provider);
  const { wrapped, usage } = metered(
    base,
    opts.provider === "scripted" ? 0 : (opts.delayMs ?? 0),
    opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  );
  const instance = scenario.instantiate();
  const trace: RunTrace = { calls: [], text: "" };
  const { tools, impls } = toolset(instance.tools);
  const logged = Object.fromEntries(
    Object.entries(impls).map(([name, impl]) => [
      name,
      async (args: Record<string, unknown>) => {
        try {
          const out = await impl(args);
          trace.calls.push({ tool: name, args, ok: true });
          return out;
        } catch (err) {
          trace.calls.push({ tool: name, args, ok: false });
          throw err;
        }
      },
    ]),
  );
  const events: GuardEvent[] = [];
  const guard = createGuard({
    provider: wrapped,
    gate: opts.gate,
    tools,
    impls: logged,
    system: scenario.system,
    maxTurns: MAX_TURNS,
    onEvent: (e) => events.push(e),
  });
  const record = {
    scenario: scenario.id,
    domain: scenario.domain,
    utilityOnly: !scenario.injection,
    gate: opts.gateKind,
    ...label,
    run: opts.run,
  };
  const facts = () => ({
    blocked: events
      .filter((e) => e.type === EventType.BLOCK)
      .map((e) => `${e.tool ?? "?"} (${e.ruleId ?? e.reason ?? "?"})`),
    checkLatenciesMs: events.flatMap((e) => (e.latencyMs === undefined ? [] : [e.latencyMs])),
    ...usage,
  });
  try {
    const result = await guard.run({ user: EVAL_USER, task: scenario.userTask });
    trace.text = result.text ?? "";
    const judged = instance.judge(trace);
    return { ...record, outcome: RunOutcome.FINISHED, ...judged, ...facts(), turns: result.turns };
  } catch (err) {
    const judged = instance.judge(trace);
    return {
      ...record,
      outcome: RunOutcome.ERROR,
      ...judged,
      ...facts(),
      turns: 0,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err),
    };
  } finally {
    await opts.gate.close();
  }
}
