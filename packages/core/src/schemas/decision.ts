import { z } from "zod";

import { Verdict } from "../enums/verdict.enum.js";
import { ApproverSpec } from "./policy.js";

// ARCHITECTURE §3.5: core cannot create holds, so a hold has no id here.
export const Decision = z.discriminatedUnion("verdict", [
  z.strictObject({
    verdict: z.literal(Verdict.ALLOW),
    ruleId: z.string(),
    planStep: z.number().int(),
  }),
  z.strictObject({
    verdict: z.literal(Verdict.BLOCK),
    ruleId: z.string().nullable(),
    reason: z.string(),
  }),
  z.strictObject({
    verdict: z.literal(Verdict.HOLD),
    ruleId: z.string(),
    planStep: z.number().int(),
    approvers: ApproverSpec,
    timeoutSeconds: z.number().int().positive(),
  }),
]);
export type Decision = z.infer<typeof Decision>;

export type HoldDecision = Extract<Decision, { verdict: Verdict.HOLD }>;

export type GateDecision = Exclude<Decision, HoldDecision> | (HoldDecision & { holdId: string });

export const GateDecision = z.union([Decision, Decision.options[2].extend({ holdId: z.string() })]);
