import { type Decision, type HoldDecision, Verdict } from "@intentlock/core";

export function isHold(decision: Decision): decision is HoldDecision {
  return decision.verdict === Verdict.HOLD;
}

export function isBlock(
  decision: Decision,
): decision is Extract<Decision, { verdict: Verdict.BLOCK }> {
  return decision.verdict === Verdict.BLOCK;
}
