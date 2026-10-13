import {
  API_ENDPOINTS,
  apiPath,
  ClientBlockReason,
  ClientEntryKind,
  decide,
  type GateDecision,
  Plan,
  type PlanInput,
  ReportOutcome,
  ToolCall,
  Verdict,
} from "@intentlock/core";
import { decodeJwt } from "jose";

import type { Gate, HoldOutcome, RefreshedToken, SignedPlan } from "../gate.js";
import { HttpClient } from "../http/client.js";
import { waitForHold } from "../http/wait-for-hold.js";
import { FileOutbox } from "../outbox/file-outbox.js";
import { MemoryOutbox, type PlanBacklog } from "../outbox/memory-outbox.js";
import { OutboxWorker } from "../outbox/worker.js";
import { onShutdown } from "../shutdown.js";
import { remoteJwks } from "./jwks-cache.js";

export interface HybridGateOptions {
  baseUrl: string;
  apiKey: string;
  outboxDir?: string | null;
  flushIntervalMs?: number;
  maxBatch?: number;
  maxUnacked?: number;
  maxUnackedAgeMs?: number;
  flushTimeoutMs?: number;
  fsync?: boolean;
  timeoutMs?: number;
  handleSignals?: boolean;
  fetch?: typeof fetch;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

const DEFAULTS = {
  outboxDir: ".intentlock/outbox",
  flushIntervalMs: 5_000,
  maxBatch: 100,
  maxUnacked: 500,
  maxUnackedAgeMs: 60_000,
  flushTimeoutMs: 10_000,
};

type PlanTrack = {
  required: Set<number>;
  ran: Set<number>;
  steps: Map<string, number>;
  decisions: number;
};

export class HybridGate implements Gate {
  readonly #opts: HybridGateOptions & typeof DEFAULTS;
  readonly #http: HttpClient;
  readonly #outbox: MemoryOutbox;
  readonly #worker: OutboxWorker;
  readonly #jwks: ReturnType<typeof remoteJwks>;
  readonly #usage = new Map<string, number[]>();
  readonly #plans = new Map<string, PlanTrack>();
  #started: Promise<void> | null = null;
  #closed = false;
  #unregister: (() => void) | undefined;

  constructor(opts: HybridGateOptions) {
    this.#opts = { ...DEFAULTS, ...opts } as HybridGateOptions & typeof DEFAULTS;
    this.#http = new HttpClient(opts);
    this.#outbox =
      this.#opts.outboxDir === null
        ? new MemoryOutbox()
        : new FileOutbox(this.#opts.outboxDir, { fsync: this.#opts.fsync ?? true });
    this.#worker = new OutboxWorker(this.#outbox, this.#http, {
      flushIntervalMs: this.#opts.flushIntervalMs,
      maxBatch: this.#opts.maxBatch,
      ...(opts.onError && { onError: opts.onError }),
    });
    this.#jwks = remoteJwks(this.#http.url(API_ENDPOINTS.JWKS), this.#http.fetch);
  }

  start(): Promise<void> {
    this.#started ??= (async () => {
      await this.#jwks.reload().catch((err: unknown) => this.#opts.onError?.(err));
      for (const backlog of await this.#outbox.recover()) this.#restore(backlog);
      this.#worker.start();
      await this.#worker.flush(true);
      if (this.#opts.handleSignals !== false) this.#unregister = onShutdown(() => this.close());
    })();
    return this.#started;
  }

  async signPlan(input: PlanInput): Promise<SignedPlan> {
    await this.start();
    const signed = await this.#http.post<SignedPlan>(API_ENDPOINTS.PLANS, { plan: input });
    const plan = Plan.parse(input);
    this.#track(signed.planId).required = new Set(
      plan.steps.flatMap((s, i) => (s.required ? [i] : [])),
    );
    return signed;
  }

  async refresh(planId: string, token: string): Promise<RefreshedToken> {
    await this.start();
    return this.#http.post<RefreshedToken>(apiPath(API_ENDPOINTS.PLAN_REFRESH, { id: planId }), {
      token,
    });
  }

  async check(token: string, call: ToolCall): Promise<GateDecision> {
    await this.start();
    if (this.#backlogged()) return clientBlock(ClientBlockReason.AUDIT_BACKLOG);
    const planId = planIdOf(token);
    let usage: number[] | undefined;
    const decision = await decide(
      token,
      this.#jwks,
      call,
      (id) => {
        const u = this.#usageFor(id);
        usage = [...u];
        return u;
      },
      this.#now(),
    );

    let result: GateDecision = decision as GateDecision;
    if (decision.verdict === Verdict.HOLD) {
      try {
        const res = await this.#http.post<{ holdId: string }>(API_ENDPOINTS.HOLDS, {
          token,
          call,
          ruleId: decision.ruleId,
        });
        result = { ...decision, holdId: res.holdId };
      } catch (err) {
        this.#opts.onError?.(err);
        result = clientBlock(ClientBlockReason.SERVER_UNAVAILABLE);
      }
    }
    if (!planId) return result;

    const parsedCall = ToolCall.safeParse(call);
    try {
      await this.#outbox.append(planId, {
        planId,
        clientAt: this.#now().toISOString(),
        kind: ClientEntryKind.CHECK,
        token,
        ...(parsedCall.success && { call: parsedCall.data }),
        decision: result,
        ...(usage && { usage }),
      });
    } catch (err) {
      this.#opts.onError?.(err);
      return clientBlock(ClientBlockReason.AUDIT_WRITE_FAILED);
    }
    const track = this.#track(planId);
    track.decisions++;
    if (result.verdict !== Verdict.BLOCK && parsedCall.success) {
      track.steps.set(parsedCall.data.callId, result.planStep);
    }
    this.#worker.nudge();
    return result;
  }

  waitForHold(
    holdId: string,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<HoldOutcome> {
    return waitForHold(this.#http, holdId, opts);
  }

  async report(token: string, callId: string, outcome: ReportOutcome): Promise<void> {
    await this.start();
    const planId = planIdOf(token);
    if (!planId) return;
    const track = this.#track(planId);
    await this.#outbox.append(planId, {
      planId,
      clientAt: this.#now().toISOString(),
      kind: ClientEntryKind.REPORT,
      token,
      callId,
      outcome,
      decisionCount: track.decisions,
    });
    const step = track.steps.get(callId);
    if (outcome === ReportOutcome.OK && step !== undefined) track.ran.add(step);
    const complete = track.required.size > 0 && [...track.required].every((s) => track.ran.has(s));
    if (complete) {
      await this.#outbox.complete(planId);
      await this.#worker.drain(this.#opts.flushTimeoutMs);
    } else {
      this.#worker.nudge();
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    this.#unregister?.();
    this.#worker.stop();
    if (this.#started) await this.#worker.drain(this.#opts.flushTimeoutMs);
  }

  #backlogged(): boolean {
    if (this.#outbox.unackedCount() > this.#opts.maxUnacked) return true;
    const oldest = this.#outbox.oldestUnackedAt();
    return oldest !== null && this.#now().getTime() - oldest > this.#opts.maxUnackedAgeMs;
  }

  #restore({ planId, entries }: PlanBacklog) {
    const usage = this.#usageFor(planId);
    const track = this.#track(planId);
    for (const e of entries) {
      if (e.kind !== ClientEntryKind.CHECK || !e.decision) continue;
      track.decisions++;
      if (e.decision.verdict === Verdict.BLOCK) continue;
      const step = e.decision.planStep;
      usage[step] = Math.max(usage[step] ?? 0, (e.usage?.[step] ?? 0) + 1);
      if (e.call) track.steps.set(e.call.callId, step);
    }
  }

  #usageFor(planId: string): number[] {
    let u = this.#usage.get(planId);
    if (!u) this.#usage.set(planId, (u = []));
    return u;
  }

  #track(planId: string): PlanTrack {
    let t = this.#plans.get(planId);
    if (!t) {
      t = { required: new Set(), ran: new Set(), steps: new Map(), decisions: 0 };
      this.#plans.set(planId, t);
    }
    return t;
  }

  #now(): Date {
    return this.#opts.now?.() ?? new Date();
  }
}

function clientBlock(reason: ClientBlockReason): GateDecision {
  return { verdict: Verdict.BLOCK, ruleId: null, reason };
}

function planIdOf(token: string): string | null {
  try {
    return decodeJwt(token).jti ?? null;
  } catch {
    return null;
  }
}
