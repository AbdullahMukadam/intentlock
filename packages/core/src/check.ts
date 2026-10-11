import { verifyBundle, type VerificationKey } from "./crypto/bundle-token.js";
import { TokenExpiredError } from "./errors.js";
import { matchStep } from "./plan/match-step.js";
import { evaluatePolicy } from "./policy/evaluate.js";
import type { BundleClaims } from "./schemas/bundle.js";
import type { BlockReason, Decision } from "./schemas/decision.js";
import { ToolCall } from "./schemas/tool-call.js";

export function block(reason: BlockReason): Decision {
  return { verdict: "block", ruleId: null, reason };
}

function decideUnsafe(bundle: BundleClaims, call: ToolCall, usage: readonly number[]): Decision {
  let matchedStep = false;
  let planStep = -1;
  for (const [i, step] of bundle.plan.steps.entries()) {
    if (!matchStep(step, call)) continue;
    matchedStep = true;
    if ((usage[i] ?? 0) < step.maxCalls) {
      planStep = i;
      break;
    }
  }
  if (!matchedStep) return block("not_in_plan");
  if (planStep < 0) return block("call_limit");

  const ctx = {
    user: { email: bundle.sub, role: bundle.role, groups: bundle.groups },
    inPlan: true,
  };
  const rule = evaluatePolicy(bundle.pol, call, ctx);
  if (!rule) return block("no_matching_rule");
  switch (rule.decision) {
    case "allow":
      return { verdict: "allow", ruleId: rule.id, planStep };
    case "block":
      return {
        verdict: "block",
        ruleId: rule.id,
        reason: rule.reason ?? `Blocked by rule ${rule.id}`,
      };
    case "hold":
      return {
        verdict: "hold",
        ruleId: rule.id,
        planStep,
        approvers: rule.approvers,
        timeoutSeconds: rule.timeoutSeconds,
      };
  }
}

/**
 * ARCHITECTURE §4, steps after token verification. Pure and synchronous; never throws.
 * `usage[i]` is the number of calls already counted against plan step i.
 */
export function check(bundle: BundleClaims, call: ToolCall, usage: readonly number[]): Decision {
  try {
    return decideUnsafe(bundle, call, usage);
  } catch {
    return block("internal_error");
  }
}

/**
 * Verify the token, then check the call. On allow or hold the matched step's count in `usage`
 * is incremented in the same synchronous section as the check, so concurrent calls cannot
 * overshoot maxCalls.
 */
export async function decide(
  token: string,
  key: VerificationKey,
  call: unknown,
  usage: number[],
  now: Date,
): Promise<Decision> {
  const parsedCall = ToolCall.safeParse(call);
  if (!parsedCall.success) return block("invalid_call");
  let bundle: BundleClaims;
  try {
    bundle = await verifyBundle(token, key, now);
  } catch (err) {
    return block(err instanceof TokenExpiredError ? "token_expired" : "invalid_token");
  }
  const decision = check(bundle, parsedCall.data, usage);
  if (decision.verdict !== "block") usage[decision.planStep] = (usage[decision.planStep] ?? 0) + 1;
  return decision;
}
