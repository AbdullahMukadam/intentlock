import { z } from "zod";

export const RunEntryPayloadSchema = z.object({
  call: z
    .object({ callId: z.string(), args: z.record(z.string(), z.unknown()) })
    .partial()
    .nullish(),
  decision: z
    .object({ reason: z.string(), holdId: z.string(), planStep: z.number() })
    .partial()
    .nullish(),
  callId: z.string().optional(),
  outcome: z.string().optional(),
});
