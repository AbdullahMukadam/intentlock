import {
  API_ENDPOINTS,
  apiPath,
  GateDecision,
  type PlanInput,
  type ReportOutcome,
  type ToolCall,
} from "@intentlock/core";

import { GateUnavailableError } from "../errors.js";
import type { Gate, HoldOutcome, RefreshedToken, SignedPlan } from "../gate.js";
import { HttpClient, type HttpClientOptions } from "./client.js";
import { waitForHold } from "./wait-for-hold.js";

export type HttpGateOptions = HttpClientOptions;

export class HttpGate implements Gate {
  readonly #http: HttpClient;

  constructor(opts: HttpGateOptions) {
    this.#http = new HttpClient(opts);
  }

  signPlan(plan: PlanInput): Promise<SignedPlan> {
    return this.#http.post<SignedPlan>(API_ENDPOINTS.PLANS, { plan });
  }

  refresh(planId: string, token: string): Promise<RefreshedToken> {
    return this.#http.post<RefreshedToken>(apiPath(API_ENDPOINTS.PLAN_REFRESH, { id: planId }), {
      token,
    });
  }

  async check(token: string, call: ToolCall): Promise<GateDecision> {
    const parsed = GateDecision.safeParse(
      await this.#http.post(API_ENDPOINTS.CHECK, { token, call }),
    );
    if (!parsed.success) throw new GateUnavailableError("Malformed decision from the server");
    return parsed.data as GateDecision;
  }

  waitForHold(
    holdId: string,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<HoldOutcome> {
    return waitForHold(this.#http, holdId, opts);
  }

  async report(token: string, callId: string, outcome: ReportOutcome): Promise<void> {
    await this.#http.post(API_ENDPOINTS.REPORT, { token, callId, outcome });
  }

  async close(): Promise<void> {}
}
