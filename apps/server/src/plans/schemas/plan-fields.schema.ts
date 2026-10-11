import { Plan } from "@intentlock/core";
import { z } from "zod";

import { MAX_TOKEN_LENGTH } from "../constants/plan.constants.js";

export const PlanSchema = Plan.transform((p) => ({ ...p, user: p.user.toLowerCase() }));
export const TokenSchema = z.string().min(1).max(MAX_TOKEN_LENGTH);
