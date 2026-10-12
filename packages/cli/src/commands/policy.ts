import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { API_ENDPOINTS, apiPath } from "@intentlock/core";
import type { Command } from "commander";

import { resolveAgentId } from "../api/resolve-agent.js";
import { sessionApi } from "../api/session-api.js";
import type { CliContext } from "../types/cli-context.type.js";
import { columns } from "../utils/columns.util.js";
import { readPolicyFile, registerPolicyValidate, validatePolicySource } from "./policy-validate.js";

type PolicyState = { active: { version: number; source: string; message: string } };
type TestResult = {
  results: {
    call: { tool: string };
    from: { verdict: string; ruleId: string | null };
    to: { verdict: string; ruleId: string | null };
  }[];
  changed: { from: string; to: string; count: number }[];
};

export function registerPolicy(program: Command, ctx: CliContext) {
  const policy = program.command("policy").description("Validate, test and publish agent policies");
  registerPolicyValidate(policy, ctx);

  policy
    .command("pull")
    .requiredOption("--agent <name>")
    .option("--out <file>", "write the active source to a file instead of stdout")
    .action(async (opts: { agent: string; out?: string }) => {
      const api = await sessionApi(ctx);
      const id = await resolveAgentId(api, opts.agent);
      const { active } = await api.get<PolicyState>(apiPath(API_ENDPOINTS.AGENT_POLICY, { id }));
      if (!opts.out) {
        ctx.print(active.source.trimEnd());
        return;
      }
      await writeFile(resolve(ctx.cwd, opts.out), active.source, "utf8");
      ctx.print(`Wrote v${active.version} of ${opts.agent} to ${opts.out}`);
    });

  policy
    .command("test")
    .requiredOption("--agent <name>")
    .argument("<file>")
    .option("--replay <n>", "replay the agent's last n decisions", (v) => Number.parseInt(v, 10))
    .option("--calls <json>", "JSON file with sample calls [{ call, user, inPlan? }]")
    .action(async (file: string, opts: { agent: string; replay?: number; calls?: string }) => {
      const source = await readPolicyFile(ctx, file);
      validatePolicySource(ctx, file, source);
      const calls: unknown = opts.calls
        ? JSON.parse(await readFile(resolve(ctx.cwd, opts.calls), "utf8"))
        : [];
      const api = await sessionApi(ctx);
      const id = await resolveAgentId(api, opts.agent);
      const res = await api.post<TestResult>(apiPath(API_ENDPOINTS.AGENT_POLICY_TEST, { id }), {
        source,
        calls,
        ...(opts.replay && { replayLast: opts.replay }),
      });
      for (const line of columns([
        ["TOOL", "ACTIVE", "FILE"],
        ...res.results.map((r) => [
          r.call.tool,
          `${r.from.verdict} (${r.from.ruleId ?? "-"})`,
          `${r.to.verdict} (${r.to.ruleId ?? "-"})`,
        ]),
      ])) {
        ctx.print(line);
      }
      if (res.changed.length === 0)
        ctx.print(`No decision changes across ${res.results.length} calls`);
      for (const c of res.changed) ctx.print(`${c.count} call(s) ${c.from} → ${c.to}`);
    });

  policy
    .command("push")
    .requiredOption("--agent <name>")
    .requiredOption("-m, --message <message>")
    .argument("<file>")
    .action(async (file: string, opts: { agent: string; message: string }) => {
      const source = await readPolicyFile(ctx, file);
      validatePolicySource(ctx, file, source);
      const api = await sessionApi(ctx);
      const id = await resolveAgentId(api, opts.agent);
      const { active } = await api.get<PolicyState>(apiPath(API_ENDPOINTS.AGENT_POLICY, { id }));
      const published = await api.post<{ version: number }>(
        apiPath(API_ENDPOINTS.AGENT_POLICY_PUBLISH, { id }),
        { source, baseVersion: active.version, message: opts.message },
      );
      ctx.print(`Published ${opts.agent} v${published.version} (was v${active.version})`);
    });
}
