import { z } from "zod";

import { ApproverSpec } from "./policy.js";

export const BlockReason = z.enum([
  "invalid_token",
  "token_expired",
  "invalid_call",
  "not_in_plan",
  "call_limit",
  "no_matching_rule",
  "internal_error",
]);
export type BlockReason = z.infer<typeof BlockReason>;

// ARCHITECTURE §3.5: core cannot create holds, so a hold has no id here.
export const Decision = z.discriminatedUnion("verdict", [
  z.strictObject({ verdict: z.literal("allow"), ruleId: z.string(), planStep: z.number().int() }),
  z.strictObject({
    verdict: z.literal("block"),
    ruleId: z.string().nullable(),
    reason: z.string(),
  }),
  z.strictObject({
    verdict: z.literal("hold"),
    ruleId: z.string(),
    planStep: z.number().int(),
    approvers: ApproverSpec,
    timeoutSeconds: z.number().int().positive(),
  }),
]);
export type Decision = z.infer<typeof Decision>;

export type HoldDecision = Extract<Decision, { verdict: "hold" }>;

export type GateDecision = Exclude<Decision, HoldDecision> | (HoldDecision & { holdId: string });
