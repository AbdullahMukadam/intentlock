import { API_ENDPOINTS, apiPath } from "@intentlock/core";
import type { Command } from "commander";

import { resolveAgentId } from "../api/resolve-agent.js";
import { sessionApi } from "../api/session-api.js";
import type { CliContext } from "../types/cli-context.type.js";
import { columns } from "../utils/columns.util.js";

type Agent = {
  id: string;
  name: string;
  policyVersion: number | null;
  activeKeys: number;
  disabledAt: string | null;
  last24h: { allow: number; block: number; hold: number };
};

export function registerAgents(program: Command, ctx: CliContext) {
  const agents = program.command("agents").description("Manage agents (create/disable: admin)");

  agents
    .command("create")
    .argument("<name>", "kebab-case, e.g. github-assistant")
    .option("--description <text>")
    .action(async (name: string, opts: { description?: string }) => {
      const agent = await (
        await sessionApi(ctx)
      ).post<Agent>(API_ENDPOINTS.AGENTS, {
        name,
        ...(opts.description && { description: opts.description }),
      });
      ctx.print(
        `Created ${agent.name} (${agent.id}) with the starter policy as v${agent.policyVersion}`,
      );
    });

  agents.command("list").action(async () => {
    const list = await (await sessionApi(ctx)).get<Agent[]>(API_ENDPOINTS.AGENTS);
    for (const line of columns([
      ["NAME", "ID", "POLICY", "KEYS", "24H ALLOW/BLOCK/HOLD", "STATUS"],
      ...list.map((a) => [
        a.name,
        a.id,
        a.policyVersion === null ? null : `v${a.policyVersion}`,
        a.activeKeys,
        `${a.last24h.allow}/${a.last24h.block}/${a.last24h.hold}`,
        a.disabledAt ? "disabled" : "active",
      ]),
    ])) {
      ctx.print(line);
    }
  });

  agents
    .command("disable")
    .argument("<name>")
    .action(async (name: string) => {
      const api = await sessionApi(ctx);
      await api.delete(apiPath(API_ENDPOINTS.AGENT, { id: await resolveAgentId(api, name) }));
      ctx.print(`Disabled ${name}; it can no longer sign new plans`);
    });
}
