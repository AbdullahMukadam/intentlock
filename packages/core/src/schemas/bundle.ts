import { z } from "zod";

import { Plan } from "./plan.js";
import { PolicySet, Role } from "./policy.js";

export const BundleClaims = z.object({
  iss: z.literal("intentlock"),
  sub: z.email(),
  jti: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
  ph: z.string(),
  plan: Plan,
  agent: z.string().min(1),
  pol: PolicySet,
  polv: z.number().int().positive(),
  polh: z.string(),
  role: Role,
  groups: z.array(z.string()),
  org: z.string().min(1),
});
export type BundleClaims = z.infer<typeof BundleClaims>;
