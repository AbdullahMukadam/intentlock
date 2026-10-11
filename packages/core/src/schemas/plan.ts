import { z } from "zod";

export const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

const Regex = z.string().refine(
  (s) => {
    try {
      new RegExp(s, "u");
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid regular expression" },
);

const Json = z.json();

export const ArgConstraint = z.union([
  z.strictObject({ eq: Json }),
  z.strictObject({ in: z.array(Json).min(1) }),
  z.strictObject({ glob: z.string() }),
  z.strictObject({ regex: Regex }),
  z.strictObject({ lte: z.number() }),
  z.strictObject({ gte: z.number() }),
]);
export type ArgConstraint = z.infer<typeof ArgConstraint>;

export const ArgCondition = z.union([
  ...ArgConstraint.options,
  z.strictObject({ notIn: z.array(Json).min(1) }),
  z.strictObject({ notGlob: z.string() }),
]);
export type ArgCondition = z.infer<typeof ArgCondition>;

export const PlanStep = z.strictObject({
  tool: z.string().regex(TOOL_NAME),
  args: z.record(z.string(), ArgConstraint).optional(),
  maxCalls: z.number().int().positive().default(20),
  required: z.boolean().default(false),
});
export type PlanStep = z.infer<typeof PlanStep>;

export const Plan = z.strictObject({
  version: z.literal(1),
  goal: z.string().max(500),
  user: z.email(),
  steps: z.array(PlanStep).min(1).max(50),
});
export type Plan = z.infer<typeof Plan>;
export type PlanInput = z.input<typeof Plan>;
