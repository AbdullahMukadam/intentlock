#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

import { HybridGate } from "@intentlock/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { parseProxyArgs, USAGE, wantsHelp } from "./args.js";
import { EnvVar } from "./enums/env-var.enum.js";
import { planFromFile } from "./plan-file.js";
import { createProxy, listUpstreamTools } from "./proxy.js";
import { upstreamEnv } from "./upstream-env.js";

const { version: VERSION } = createRequire(import.meta.url)("../package.json") as {
  version: string;
};
const log = (line: string) => process.stderr.write(`intentlock-mcp: ${line}\n`);

function required(name: EnvVar, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function main() {
  const argv = process.argv.slice(2);
  if (wantsHelp(argv)) {
    process.stdout.write(`${USAGE}
`);
    return;
  }
  const args = parseProxyArgs(argv);
  const upstream = new Client({ name: "intentlock-mcp", version: VERSION });
  await upstream.connect(
    new StdioClientTransport({
      command: args.command,
      args: args.commandArgs,
      env: upstreamEnv(process.env),
      stderr: "inherit",
    }),
  );

  if (args.listTools) {
    for (const tool of await listUpstreamTools(upstream)) {
      process.stdout.write(`${tool.name}\t${tool.description ?? ""}\n`);
    }
    await upstream.close();
    return;
  }

  const user = required(EnvVar.USER, args.user ?? process.env[EnvVar.USER]);
  if (args.plan === undefined) throw new Error(USAGE);
  const plan = planFromFile(await readFile(args.plan, "utf8"), user);
  const upstreamTools = new Set((await listUpstreamTools(upstream)).map((t) => t.name));
  for (const step of plan.steps) {
    if (!upstreamTools.has(step.tool))
      log(`plan step ${step.tool} is not a tool of the upstream server`);
  }

  const gate = new HybridGate({
    baseUrl: required(EnvVar.URL, process.env[EnvVar.URL]),
    apiKey: required(EnvVar.API_KEY, process.env[EnvVar.API_KEY]),
    outboxDir: process.env[EnvVar.OUTBOX_DIR] ?? join(homedir(), ".intentlock", "outbox"),
    onError: (err) => log(`gate: ${err instanceof Error ? err.message : String(err)}`),
  });
  const server = createProxy({ gate, upstream, plan, version: VERSION, log });
  server.onclose = () => {
    Promise.allSettled([upstream.close(), gate.close()]).catch(() => undefined);
  };
  await server.connect(new StdioServerTransport());
  log(`guarding ${args.command} for ${user} (${plan.steps.length} planned tools)`);
}

main().catch((err: unknown) => {
  log(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
