"use client";

import { API_ENDPOINTS } from "@intentlock/core";

import { NativeSelect } from "@/components/native-select";
import { apiUrl } from "@/lib/api";
import { type AgentSummary, AgentSummaries } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

export function useAgentList() {
  const { data, error } = useApi(apiUrl(API_ENDPOINTS.AGENTS), AgentSummaries);
  return { agents: data, failed: error !== undefined };
}

export function useAgents() {
  const { agents, failed } = useAgentList();
  return { agents: agents ?? [], failed };
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
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </NativeSelect>
  );
}
