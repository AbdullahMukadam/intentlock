import type { Decision, HoldDecision } from "@intentlock/core";

import { AuditVerdict } from "../../audit/enums/audit-verdict.enum.js";

export function isHold(decision: Decision): decision is HoldDecision {
  return decision.verdict === AuditVerdict.HOLD;
}

export function isBlock(decision: Decision): decision is Extract<Decision, { verdict: "block" }> {
  return decision.verdict === AuditVerdict.BLOCK;
}
