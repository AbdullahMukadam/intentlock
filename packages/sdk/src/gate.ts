import type { GateDecision, PlanInput, ReportOutcome, ToolCall } from "@intentlock/core";

export interface SignedPlan {
  planId: string;
  token: string;
  planHash: string;
  policyVersion: number;
  policyHash: string;
  expiresAt: string;
}

export type HoldOutcome = "approved" | "rejected" | "expired";

/** ARCHITECTURE §6. Every implementation fails closed: only an explicit allow lets a tool run. */
export interface Gate {
  signPlan(plan: PlanInput): Promise<SignedPlan>;
  check(token: string, call: ToolCall): Promise<GateDecision>;
  waitForHold(
    holdId: string,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<HoldOutcome>;
  report(token: string, callId: string, outcome: ReportOutcome): Promise<void>;
  close(): Promise<void>;
}
