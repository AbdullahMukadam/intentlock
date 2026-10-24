import { z } from "zod";

import { HoldStatus } from "../enums/hold-status.enum.js";

export const HoldInfo = z.object({
  status: z.enum(HoldStatus),
  planId: z.string(),
  callId: z.string(),
  tool: z.string(),
  args: z.record(z.string(), z.unknown()),
});
export type HoldInfo = z.infer<typeof HoldInfo>;
