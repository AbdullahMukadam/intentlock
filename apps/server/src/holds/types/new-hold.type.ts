import type { HoldDecision, ToolCall } from "@intentlock/core";

export type NewHold = {
  orgId: string;
  agentId: string;
  planId: string;
  user: string;
  call: ToolCall;
  decision: HoldDecision;
  now: Date;
};
