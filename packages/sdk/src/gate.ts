import type {
  GateDecision,
  GatePlanState,
  HoldInfo,
  PlanInput,
  ReportOutcome,
  ToolCall,
} from "@intentlock/core";

export interface SignedPlan {
  planId: string;
  token: string;
  planHash: string;
  policyVersion: number;
  policyHash: string;
  expiresAt: string;
}

export interface RefreshedToken {
  token: string;
  expiresAt: string;
}

export type HoldOutcome = "approved" | "rejected" | "expired";

/** ARCHITECTURE §6. Every implementation fails closed: only an explicit allow lets a tool run. */
export interface Gate {
  signPlan(plan: PlanInput): Promise<SignedPlan>;
  refresh(planId: string, token: string): Promise<RefreshedToken>;
  check(token: string, call: ToolCall): Promise<GateDecision>;
  waitForHold(
    holdId: string,
    opts: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<HoldOutcome>;
  report(token: string, callId: string, outcome: ReportOutcome): Promise<void>;
  close(): Promise<void>;
  holdInfo?(holdId: string): Promise<HoldInfo>;
  exportPlan?(planId: string): Promise<GatePlanState | null>;
  importPlan?(planId: string, state: unknown): Promise<void>;
}
