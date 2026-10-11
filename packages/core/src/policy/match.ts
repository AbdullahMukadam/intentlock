import { globMatch, matchArg } from "../plan/match-step.js";
import type { Match, Role } from "../schemas/policy.js";
import type { ToolCall } from "../schemas/tool-call.js";

export interface PolicyUser {
  email: string;
  role: Role;
  groups: readonly string[];
}

export interface MatchContext {
  user: PolicyUser;
  inPlan: boolean;
}

export function matches(match: Match, call: ToolCall, ctx: MatchContext): boolean {
  if (match.tool !== undefined) {
    const patterns = typeof match.tool === "string" ? [match.tool] : match.tool;
    if (!patterns.some((p) => globMatch(call.tool, p))) return false;
  }
  if (match.args && !Object.entries(match.args).every(([k, c]) => matchArg(c, call.args, k))) {
    return false;
  }
  if (match.user) {
    const { email, role, group } = match.user;
    if (email !== undefined && !globMatch(ctx.user.email, email, true)) return false;
    if (role !== undefined && ctx.user.role !== role) return false;
    if (group !== undefined && !ctx.user.groups.includes(group)) return false;
  }
  if (match.inPlan !== undefined && match.inPlan !== ctx.inPlan) return false;
  return true;
}
