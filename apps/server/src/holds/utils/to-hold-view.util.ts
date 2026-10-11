import type { Hold } from "../../generated/prisma/client.js";
import { toHoldState } from "./hold-state.util.js";

export function toHoldView(hold: Hold) {
  return {
    id: hold.id,
    planId: hold.planId,
    agentId: hold.agentId,
    callId: hold.callId,
    tool: hold.tool,
    args: hold.args,
    user: hold.user,
    ruleId: hold.ruleId,
    approvers: hold.approvers,
    status: toHoldState(hold.status),
    resolvedBy: hold.resolvedBy,
    note: hold.note,
    expiresAt: hold.expiresAt,
    createdAt: hold.createdAt,
    resolvedAt: hold.resolvedAt,
  };
}
