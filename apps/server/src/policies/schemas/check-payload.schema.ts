import { ToolCall } from "@intentlock/core";
import { z } from "zod";

// The part of a `check` audit entry's payload that the policy replay reads (ADR-035).
export const CheckPayloadSchema = z.object({
  call: ToolCall,
  inPlan: z.boolean().default(true),
});
