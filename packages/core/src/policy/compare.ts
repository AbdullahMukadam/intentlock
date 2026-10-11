import type { PolicySet } from "../schemas/policy.js";
import type { ToolCall } from "../schemas/tool-call.js";
import { evaluatePolicy } from "./evaluate.js";
import type { PolicyUser } from "./match.js";

export type PolicyVerdict = "allow" | "block" | "hold";

export interface SampleCall {
  call: ToolCall;
  user: PolicyUser;
  inPlan?: boolean;
}

export interface PolicyOutcome {
  verdict: PolicyVerdict;
  ruleId: string | null;
}

export interface ComparisonResult {
  call: ToolCall;
  from: PolicyOutcome;
  to: PolicyOutcome;
}

export interface Comparison {
  results: ComparisonResult[];
  changed: { from: PolicyVerdict; to: PolicyVerdict; count: number }[];
}

function outcome(policy: PolicySet, sample: SampleCall): PolicyOutcome {
  const rule = evaluatePolicy(policy, sample.call, {
    user: sample.user,
    inPlan: sample.inPlan ?? true,
  });
  return rule ? { verdict: rule.decision, ruleId: rule.id } : { verdict: "block", ruleId: null };
}

/** Dry run for the policy editor and CLI: how each sample is decided under the old and new policy. */
export function compareDecisions(
  oldPolicy: PolicySet,
  newPolicy: PolicySet,
  samples: readonly SampleCall[],
): Comparison {
  const results = samples.map((s) => ({
    call: s.call,
    from: outcome(oldPolicy, s),
    to: outcome(newPolicy, s),
  }));
  const counts = new Map<string, Comparison["changed"][number]>();
  for (const { from, to } of results) {
    if (from.verdict === to.verdict) continue;
    const key = `${from.verdict}>${to.verdict}`;
    const entry = counts.get(key) ?? { from: from.verdict, to: to.verdict, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return { results, changed: [...counts.values()] };
}
