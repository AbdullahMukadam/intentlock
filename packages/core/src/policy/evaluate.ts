import type { PolicySet, Rule } from "../schemas/policy.js";
import type { ToolCall } from "../schemas/tool-call.js";
import { matches, type MatchContext } from "./match.js";

/** First matching rule wins; null means the policy default (always block). */
export function evaluatePolicy(policy: PolicySet, call: ToolCall, ctx: MatchContext): Rule | null {
  for (const rule of policy.rules) {
    if (!matches(rule.match, call, ctx)) continue;
    if (rule.except && matches(rule.except, call, ctx)) continue;
    return rule;
  }
  return null;
}
