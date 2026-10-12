import type { Plan } from "@intentlock/core";

import { MAX_REGEX_LENGTH } from "../constants/plan.constants.js";

// ponytail: heuristic that rejects nested quantifiers like (a+)+; swap for a real ReDoS analyzer if planners turn hostile.
const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)\s*[+*{]/;

export function unsafeRegexes(plan: Plan): string[] {
  const found: string[] = [];
  for (const step of plan.steps) {
    for (const constraint of Object.values(step.args ?? {})) {
      if (!("regex" in constraint)) continue;
      const r = constraint.regex;
      if (r.length > MAX_REGEX_LENGTH || NESTED_QUANTIFIER.test(r)) found.push(r);
    }
  }
  return found;
}
