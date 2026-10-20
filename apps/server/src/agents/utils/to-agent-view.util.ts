import type { Agent } from "../../generated/prisma/client.js";
import type { VerdictCounts } from "../../common/types/verdict-counts.type.js";

export function toAgentView(
  agent: Agent & { policy: { activeVersion: number } | null; _count: { apiKeys: number } },
  last24h: VerdictCounts,
) {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    disabledAt: agent.disabledAt,
    deletedAt: agent.deletedAt,
    createdBy: agent.createdBy,
    createdAt: agent.createdAt,
    activeKeys: agent._count.apiKeys,
    policyVersion: agent.policy?.activeVersion ?? null,
    last24h,
  };
}
