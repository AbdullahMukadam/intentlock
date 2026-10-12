import { API_ENDPOINTS, apiPath } from "@intentlock/core";
import type { Command } from "commander";

import { resolveAgentId } from "../api/resolve-agent.js";
import { sessionApi } from "../api/session-api.js";
import type { CliContext } from "../types/cli-context.type.js";
import { columns } from "../utils/columns.util.js";

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function registerKeys(program: Command, ctx: CliContext) {
  const keys = program.command("keys").description("Manage an agent's API keys (admin)");

  keys
    .command("create")
    .requiredOption("--agent <name>")
    .requiredOption("--name <keyName>", "where it runs, e.g. production")
    .action(async (opts: { agent: string; name: string }) => {
      const api = await sessionApi(ctx);
      const id = await resolveAgentId(api, opts.agent);
      const key = await api.post<{ id: string; prefix: string; key: string }>(
        apiPath(API_ENDPOINTS.AGENT_API_KEYS, { id }),
        { name: opts.name },
      );
      ctx.print(`Key ${key.id} (${key.prefix}…) for ${opts.agent}`);
      ctx.print(`INTENTLOCK_API_KEY=${key.key}`);
      ctx.print("Shown once: store it in the agent app's secrets now.");
    });

  keys
    .command("list")
    .requiredOption("--agent <name>")
    .action(async (opts: { agent: string }) => {
      const api = await sessionApi(ctx);
      const id = await resolveAgentId(api, opts.agent);
      const list = await api.get<ApiKey[]>(apiPath(API_ENDPOINTS.AGENT_API_KEYS, { id }));
      for (const line of columns([
        ["ID", "NAME", "PREFIX", "LAST USED", "STATUS"],
        ...list.map((k) => [
          k.id,
          k.name,
          k.prefix,
          k.lastUsedAt,
          k.revokedAt ? "revoked" : "active",
        ]),
      ])) {
        ctx.print(line);
      }
    });

  keys
    .command("revoke")
    .argument("<keyId>")
    .requiredOption("--agent <name>")
    .action(async (keyId: string, opts: { agent: string }) => {
      const api = await sessionApi(ctx);
      const id = await resolveAgentId(api, opts.agent);
      await api.delete(apiPath(API_ENDPOINTS.AGENT_API_KEY, { id, keyId }));
      ctx.print(`Revoked ${keyId}; new plans with it are refused immediately`);
    });
}
