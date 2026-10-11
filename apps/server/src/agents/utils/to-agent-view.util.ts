import type { Agent } from "../../generated/prisma/client.js";
import type { AgentDecisionCounts } from "../types/agent-decision-counts.type.js";

export function toAgentView(
  agent: Agent & { policy: { activeVersion: number } | null; _count: { apiKeys: number } },
  last24h: AgentDecisionCounts,
) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    disabledAt: agent.disabledAt,
    createdBy: agent.createdBy,
    createdAt: agent.createdAt,
    activeKeys: agent._count.apiKeys,
    policyVersion: agent.policy?.activeVersion ?? null,
    last24h,
  };
}
