"use client";

import { API_ENDPOINTS } from "@intentlock/core";

import { NativeSelect } from "@/components/native-select";
import { apiUrl } from "@/lib/api";
import { type AgentSummary, AgentSummaries } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

export function useAgentList() {
  const { data, error } = useApi(
    apiUrl(API_ENDPOINTS.AGENTS, { query: { includeDeleted: true } }),
    AgentSummaries,
  );
  return { agents: data, failed: error !== undefined };
}

export function useAgents() {
  const { agents, failed } = useAgentList();
  return { agents: agents ?? [], failed };
}

export function activeAgents(agents: AgentSummary[]) {
  return agents.filter((a) => !a.deletedAt);
}

export function agentNames(agents: AgentSummary[]) {
  return new Map(agents.map((a) => [a.id, a.deletedAt ? `${a.name} (deleted)` : a.name]));
}

export function AgentFilter({
  agents,
  failed = false,
  ...props
}: { agents: AgentSummary[]; failed?: boolean } & React.ComponentProps<"select">) {
  return (
    <NativeSelect aria-label="Agent" {...props}>
      <option value="">All agents</option>
      {failed && (
        <option value="" disabled>
          Could not load agents
        </option>
      )}
      {activeAgents(agents).map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </NativeSelect>
  );
}
