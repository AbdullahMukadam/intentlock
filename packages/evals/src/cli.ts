import { join } from "node:path";
import { parseArgs } from "node:util";

import { generateSigningKeyPair, type PolicySet } from "@intentlock/core";
import { type LLMProvider, ProviderKind, providerFromEnv } from "@intentlock/guard";
import { z } from "zod";

import { Domain } from "./enums/domain.enum.js";
import { EvalMode } from "./enums/eval-mode.enum.js";
import { GateKind } from "./enums/gate-kind.enum.js";
import { loadPolicy } from "./policies.js";
import { benchAll, type ServerTarget } from "./runner/latency.js";
import { buildResults, writeResults } from "./runner/report.js";
import { makeGate, type RunRecord, runScenario } from "./runner/run.js";
import { SCENARIOS } from "./scenarios/index.js";

const Options = z.object({
  runs: z.coerce.number().int().min(1).max(20),
  modes: z.array(z.enum(EvalMode)).min(1),
  only: z.array(z.string()).optional(),
  latencyChecks: z.coerce.number().int().min(0).max(5000),
  out: z.string(),
  delayMs: z.coerce.number().int().min(0),
});

const EvalEnv = z.object({
  LLM_PROVIDER: z.string().optional(),
  INTENTLOCK_URL: z.url().optional(),
  INTENTLOCK_EVAL_API_KEY: z.string().min(1).optional(),
  INTENTLOCK_EVAL_USER: z.email().optional(),
  EVAL_TURN_DELAY_MS: z.string().optional(),
});

function parse() {
  const env = EvalEnv.parse(process.env);
  const hasModel = Boolean(env.LLM_PROVIDER) && env.LLM_PROVIDER !== ProviderKind.FAKE;
  const { values } = parseArgs({
    options: {
      runs: { type: "string", default: "3" },
      modes: { type: "string" },
      only: { type: "string" },
      "latency-checks": { type: "string", default: "200" },
      out: { type: "string", default: join(import.meta.dirname, "..", "results") },
    },
  });
  const opts = Options.parse({
    runs: values.runs,
    modes: (
      values.modes ?? (hasModel ? `${EvalMode.SCRIPTED},${EvalMode.MODEL}` : EvalMode.SCRIPTED)
    ).split(","),
    only: values.only?.split(","),
    latencyChecks: values["latency-checks"],
    out: values.out,
    delayMs: env.EVAL_TURN_DELAY_MS ?? "1500",
  });
  const server: ServerTarget | undefined =
    env.INTENTLOCK_URL && env.INTENTLOCK_EVAL_API_KEY
      ? {
          baseUrl: env.INTENTLOCK_URL,
          apiKey: env.INTENTLOCK_EVAL_API_KEY,
          ...(env.INTENTLOCK_EVAL_USER && { user: env.INTENTLOCK_EVAL_USER }),
        }
      : undefined;
  return { opts, server };
}

async function main() {
  const { opts, server } = parse();
  const scenarios = SCENARIOS.filter((s) => !opts.only || opts.only.includes(s.id));
  if (scenarios.length === 0) throw new Error("No scenarios match --only");
  const policies = new Map<Domain, PolicySet>();
  for (const d of Object.values(Domain)) policies.set(d, await loadPolicy(d));
  const { privateKey } = await generateSigningKeyPair();
  const provider: LLMProvider | undefined = opts.modes.includes(EvalMode.MODEL)
    ? providerFromEnv()
    : undefined;

  const records: RunRecord[] = [];
  const plan: { label: string; provider: LLMProvider | "scripted"; runs: number }[] = [];
  if (opts.modes.includes(EvalMode.SCRIPTED))
    plan.push({ label: "scripted", provider: "scripted", runs: 1 });
  if (provider) plan.push({ label: provider.name, provider, runs: opts.runs });

  for (const { label, provider: p, runs } of plan) {
    for (const scenario of scenarios) {
      for (const gateKind of [GateKind.NONE, GateKind.LOCAL]) {
        for (let run = 1; run <= runs; run++) {
          const policy = policies.get(scenario.domain) as PolicySet;
          const record = await runScenario({
            scenario,
            gate: makeGate(gateKind, policy, privateKey),
            gateKind,
            provider: p,
            run,
            delayMs: opts.delayMs,
          });
          records.push(record);
          const attack = record.attack === null ? "" : record.attack ? " ATTACK" : " safe";
          console.log(
            `${label} ${scenario.id} gate=${gateKind} run=${run}: ${record.outcome}${attack} task=${record.task}` +
              (record.blocked.length ? ` blocked=${record.blocked.join(",")}` : "") +
              (record.error ? ` error=${record.error.slice(0, 120)}` : ""),
          );
        }
      }
    }
  }

  const latency =
    opts.latencyChecks > 0
      ? await benchAll({
          policy: policies.get(Domain.FILES) as PolicySet,
          privateKey,
          checks: opts.latencyChecks,
          ...(server && { server }),
        })
      : [];
  const date = new Date().toISOString().slice(0, 10);
  const files = await writeResults(opts.out, buildResults(date, opts.runs, records, latency));
  console.log(`\nwrote ${files.json}\nwrote ${files.md}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
