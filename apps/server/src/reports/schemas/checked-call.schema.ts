import { z } from "zod";

export const CheckedCallSchema = z.object({ decision: z.object({ planStep: z.number().int() }) });
