import { Plan, planHash, type GateDecision, type PlanInput } from "@intentlock/core";

import type { Gate, HoldOutcome, SignedPlan } from "./gate.js";

/** Allows everything. Only for the unprotected demo/eval baseline; never use it to protect anything. */
export class PassThroughGate implements Gate {
  async signPlan(input: PlanInput): Promise<SignedPlan> {
    const plan = Plan.parse(input);
    return {
      planId: crypto.randomUUID(),
      token: "passthrough",
      planHash: await planHash(plan),
      policyVersion: 0,
      policyHash: "",
      expiresAt: new Date(8.64e15).toISOString(),
    };
  }

  async check(): Promise<GateDecision> {
    return { verdict: "allow", ruleId: "passthrough", planStep: -1 };
  }

  async waitForHold(): Promise<HoldOutcome> {
    return "approved";
  }

  async report(): Promise<void> {}

  async close(): Promise<void> {}
}
