import { z } from "zod";

export const GatePlanState = z.object({
  chain: z.object({ clientSeq: z.number().int().positive(), localHash: z.string() }).nullable(),
  usage: z.array(z.number().int().nonnegative()),
  required: z.array(z.number().int().nonnegative()),
  ran: z.array(z.number().int().nonnegative()),
  steps: z.array(z.tuple([z.string(), z.number().int()])),
  decisions: z.number().int().nonnegative(),
});
export type GatePlanState = z.infer<typeof GatePlanState>;
