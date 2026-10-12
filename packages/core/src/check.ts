import { verifyBundle, type VerificationKey } from "./crypto/bundle-token.js";
import { TokenExpiredError } from "./errors.js";
import { matchStep } from "./plan/match-step.js";
import { evaluatePolicy } from "./policy/evaluate.js";
import type { BundleClaims } from "./schemas/bundle.js";
import { BlockReason } from "./enums/block-reason.enum.js";
import { Verdict } from "./enums/verdict.enum.js";
import type { Decision } from "./schemas/decision.js";
import { ToolCall } from "./schemas/tool-call.js";

export function block(reason: BlockReason): Decision {
  return { verdict: Verdict.BLOCK, ruleId: null, reason };
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
  if (!matchedStep) return block(BlockReason.NOT_IN_PLAN);
  if (planStep < 0) return block(BlockReason.CALL_LIMIT);

  const ctx = {
    user: { email: bundle.sub, role: bundle.role, groups: bundle.groups },
    inPlan: true,
  };
  const rule = evaluatePolicy(bundle.pol, call, ctx);
  if (!rule) return block(BlockReason.NO_MATCHING_RULE);
  switch (rule.decision) {
    case Verdict.ALLOW:
      return { verdict: Verdict.ALLOW, ruleId: rule.id, planStep };
    case Verdict.BLOCK:
      return {
        verdict: Verdict.BLOCK,
        ruleId: rule.id,
        reason: rule.reason ?? `Blocked by rule ${rule.id}`,
      };
    case Verdict.HOLD:
      return {
        verdict: Verdict.HOLD,
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
    return block(BlockReason.INTERNAL_ERROR);
  }
}

/**
 * Verify the token, then check the call against `usageFor(planId)`, the per-step counts for the
 * verified plan. On allow or hold the matched step's count is incremented in the same synchronous
 * section as the check, so concurrent calls cannot overshoot maxCalls.
 */
export async function decide(
  token: string,
  key: VerificationKey,
  call: unknown,
  usageFor: (planId: string) => number[],
  now: Date,
): Promise<Decision> {
  const parsedCall = ToolCall.safeParse(call);
  if (!parsedCall.success) return block(BlockReason.INVALID_CALL);
  let bundle: BundleClaims;
  try {
    bundle = await verifyBundle(token, key, now);
  } catch (err) {
    return block(
      err instanceof TokenExpiredError ? BlockReason.TOKEN_EXPIRED : BlockReason.INVALID_TOKEN,
    );
  }
  const usage = usageFor(bundle.jti);
  const decision = check(bundle, parsedCall.data, usage);
  if (decision.verdict !== Verdict.BLOCK)
    usage[decision.planStep] = (usage[decision.planStep] ?? 0) + 1;
  return decision;
}
