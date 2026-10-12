import { API_ENDPOINTS } from "@intentlock/core";

import { CliError } from "../errors.js";
import type { ApiClient } from "./api-client.js";

export async function resolveAgentId(api: ApiClient, name: string): Promise<string> {
  const agents = await api.get<{ id: string; name: string }[]>(API_ENDPOINTS.AGENTS);
  const agent = agents.find((a) => a.name === name);
  if (!agent) throw new CliError(`No agent named "${name}"`);
  return agent.id;
}
