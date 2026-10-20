import { HoldParam } from "./enums/hold-param.enum";
import { HoldState } from "./enums/hold-state.enum";
import type { HoldView } from "./schemas";

export type HoldFilters = { q: string; agentId: string; state: HoldState };

export function parseHoldFilters(
  params: Record<string, string | string[] | undefined>,
): HoldFilters {
  const pick = (key: HoldParam) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  };
  const state = pick(HoldParam.STATE);
  return {
    q: pick(HoldParam.Q),
    agentId: pick(HoldParam.AGENT_ID),
    state: Object.values<string>(HoldState).includes(state)
      ? (state as HoldState)
      : HoldState.PENDING,
  };
}

export function matchesHold(hold: HoldView, filters: HoldFilters, agentName = "") {
  if (filters.agentId && hold.agentId !== filters.agentId) return false;
  const q = filters.q.toLowerCase();
  if (!q) return true;
  return [hold.tool, agentName, hold.user, hold.ruleId, JSON.stringify(hold.args)].some((text) =>
    text.toLowerCase().includes(q),
  );
}
