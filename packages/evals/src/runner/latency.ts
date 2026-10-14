import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { type PlanInput, type PolicySet, Verdict } from "@intentlock/core";
import { type Gate, HttpGate, HybridGate } from "@intentlock/sdk";

import { GateKind } from "../enums/gate-kind.enum.js";
import { percentile } from "./metrics.js";
import { EVAL_USER, makeGate } from "./run.js";

export interface LatencyResult {
  gate: GateKind;
  checks: number;
  allowed: number;
  p50Ms: number | null;
  p95Ms: number | null;
  meanMs: number | null;
}

export interface ServerTarget {
  baseUrl: string;
  apiKey: string;
  user?: string;
}

export const BENCH_TOOL = "fs_read";
const BENCH_ARGS = { path: "workspace/todo.md" };

export async function benchGate(gateKind: GateKind, gate: Gate, user: string, checks: number) {
  const plan: PlanInput = {
    version: 1,
    goal: "latency benchmark",
    user,
    steps: [{ tool: BENCH_TOOL, maxCalls: checks + 1 }],
  };
  try {
    const { token } = await gate.signPlan(plan);
    const times: number[] = [];
    let allowed = 0;
    for (let i = 0; i < checks; i++) {
      const started = performance.now();
      const decision = await gate.check(token, {
        tool: BENCH_TOOL,
        args: BENCH_ARGS,
        callId: `b${i}`,
      });
      times.push(performance.now() - started);
      if (decision.verdict === Verdict.ALLOW) allowed++;
    }
    const mean = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
    return {
      gate: gateKind,
      checks,
      allowed,
      p50Ms: percentile(times, 50),
      p95Ms: percentile(times, 95),
      meanMs: mean,
    } satisfies LatencyResult;
  } finally {
    await gate.close();
  }
}

export async function benchAll(opts: {
  policy: PolicySet;
  privateKey: CryptoKey;
  checks: number;
  server?: ServerTarget;
}): Promise<LatencyResult[]> {
  const results = [
    await benchGate(
      GateKind.LOCAL,
      makeGate(GateKind.LOCAL, opts.policy, opts.privateKey),
      EVAL_USER,
      opts.checks,
    ),
  ];
  if (!opts.server) return results;
  const { baseUrl, apiKey, user = EVAL_USER } = opts.server;
  results.push(
    await benchGate(
      GateKind.HYBRID,
      new HybridGate({
        baseUrl,
        apiKey,
        outboxDir: await mkdtemp(join(tmpdir(), "intentlock-bench-")),
      }),
      user,
      opts.checks,
    ),
    await benchGate(GateKind.REMOTE, new HttpGate({ baseUrl, apiKey }), user, opts.checks),
  );
  return results;
}
