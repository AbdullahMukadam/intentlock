import { BlockReason, type BundleClaims, type GateDecision, type ToolCall } from "@intentlock/core";

import { AuditKind } from "../../audit/enums/audit-kind.enum.js";
import type { AuditInput } from "../../audit/types/audit-input.type.js";
import type { AgentCaller } from "../../common/types/auth.types.js";
import { isBlock } from "../../common/utils/decision.util.js";
import { toJson } from "../../common/utils/to-json.util.js";

// Payload shape is a contract: policy replay and audit batches read call, inPlan and decision (ADR-035).
export function toCheckAudit(
  caller: AgentCaller,
  bundle: BundleClaims | null,
  call: ToolCall | null,
  decision: GateDecision,
): AuditInput {
  const inPlan = !(isBlock(decision) && decision.reason === BlockReason.NOT_IN_PLAN);
  return {
    kind: AuditKind.CHECK,
    actor: caller.agentId,
    agentId: caller.agentId,
    user: bundle?.sub ?? null,
    planId: bundle?.jti ?? null,
    tool: call?.tool ?? null,
    verdict: decision.verdict,
    ruleId: decision.ruleId,
    policyVersion: bundle?.polv ?? null,
    payload: toJson({ call, inPlan, decision }),
  };
}
