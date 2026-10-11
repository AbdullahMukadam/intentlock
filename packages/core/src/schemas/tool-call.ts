import { z } from "zod";

export const ToolCall = z.strictObject({
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
  callId: z.string(),
});
export type ToolCall = z.infer<typeof ToolCall>;
