import { parseArgs } from "node:util";

import { type GuardEvent } from "@intentlock/guard";
import { z } from "zod";

import { buildAgent } from "./build-agent.js";
import { DemoAgent } from "./enums/demo-agent.enum.js";
import { RunMode } from "./enums/run-mode.enum.js";
import { loadEnv } from "./env.js";
import { FORCED_LABEL } from "./force-attack/script.js";

const Args = z.object({
  agent: z.enum(DemoAgent),
  mode: z.enum(RunMode),
});

function describe(e: GuardEvent) {
  const args = e.args ? ` ${JSON.stringify(e.args).slice(0, 160)}` : "";
  const why = [e.ruleId, e.reason].filter(Boolean).join(" · ");
  return `${e.at.slice(11, 19)} ${e.type.toUpperCase().padEnd(10)} ${e.tool ?? ""}${args}${why ? `  (${why})` : ""}`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { mode: { type: "string", default: RunMode.PROTECTED } },
  });
  const { agent, mode } = Args.parse({ agent: positionals[0], mode: values.mode });
  const built = buildAgent({
    agent,
    mode,
    env: loadEnv(),
    onEvent: (e) => console.log(describe(e)),
  });
  console.log(`${agent} · ${mode}${built.forced ? ` · ${FORCED_LABEL}` : ""}`);
  console.log(`task: ${built.task}\n`);
  try {
    const result = await built.run();
    console.log(`\n${result.status} after ${result.turns} turns (plan ${result.planId})`);
    if (result.text) console.log(`\nmodel: ${result.text}`);
    for (const line of built.summary()) console.log(line);
  } finally {
    await built.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
