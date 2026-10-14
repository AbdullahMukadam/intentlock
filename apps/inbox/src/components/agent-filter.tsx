"use client";

import { API_ENDPOINTS } from "@intentlock/core";

import { NativeSelect } from "@/components/native-select";
import { apiUrl } from "@/lib/api";
import { type AgentSummary, AgentSummaries } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

export function useAgents() {
  return useApi(apiUrl(API_ENDPOINTS.AGENTS), AgentSummaries).data ?? [];
}

export function AgentFilter({
  agents,
  ...props
}: { agents: AgentSummary[] } & React.ComponentProps<"select">) {
  return (
    <NativeSelect aria-label="Agent" {...props}>
      <option value="">All agents</option>
      {agents.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </NativeSelect>
  );
}
