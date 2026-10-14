import { setTimeout as sleep } from "node:timers/promises";

import {
  createGuard,
  FakeProvider,
  type GuardEvent,
  type LLMProvider,
  providerFromEnv,
  toolset,
} from "@intentlock/guard";
import { type Gate, HybridGate, PassThroughGate } from "@intentlock/sdk";
import { Octokit } from "@octokit/rest";

import type { AgentSpec } from "./agents/agent-spec.js";
import { githubAgent } from "./agents/github/agent.js";
import { supportAgent } from "./agents/support/agent.js";
import { type Mailbox, mailpit } from "./agents/support/mailbox.js";
import { loadOrders, type Order } from "./agents/support/orders.js";
import { DemoAgent } from "./enums/demo-agent.enum.js";
import { RunMode } from "./enums/run-mode.enum.js";
import { apiKey, type DemoEnv, repos, required } from "./env.js";

const HOLD_TIMEOUT_MS = 600_000;
const MAX_TURNS = 25;

function paced(provider: LLMProvider, delayMs: number): LLMProvider {
  return {
    name: provider.name,
    chat: async (req) => {
      await sleep(delayMs);
      return provider.chat(req);
    },
  };
}

export interface AgentDeps {
  octokit?: Octokit;
  mailbox?: Mailbox;
  orders?: Order[];
}

function specFor(agent: DemoAgent, env: DemoEnv, deps: AgentDeps): AgentSpec {
  switch (agent) {
    case DemoAgent.GITHUB_ASSISTANT:
      return githubAgent(
        deps.octokit ??
          new Octokit({ auth: required(env, "GITHUB_TOKEN"), userAgent: "intentlock-demo" }),
        repos(env),
      );
    case DemoAgent.SUPPORT_ASSISTANT:
      return supportAgent(deps.mailbox ?? mailpit(env.MAILPIT_URL), deps.orders ?? loadOrders());
  }
}

export interface BuiltAgent {
  run: () => ReturnType<ReturnType<typeof createGuard>["run"]>;
  close: () => Promise<void>;
  forced: boolean;
  summary: () => string[];
  task: string;
}

export function buildAgent(opts: {
  agent: DemoAgent;
  mode: RunMode;
  env: DemoEnv;
  onEvent?: (e: GuardEvent) => void;
  gate?: Gate;
  deps?: AgentDeps;
}): BuiltAgent {
  const { env, agent } = opts;
  const spec = specFor(agent, env, opts.deps ?? {});
  const forced = env.DEMO_FORCE_ATTACK === "1";
  const provider = forced
    ? new FakeProvider(spec.forced())
    : paced(providerFromEnv(), env.DEMO_TURN_DELAY_MS);
  const gate =
    opts.gate ??
    (opts.mode === RunMode.PROTECTED
      ? new HybridGate({ baseUrl: env.INTENTLOCK_URL, apiKey: apiKey(env, agent) })
      : new PassThroughGate());
  const guard = createGuard({
    provider,
    gate,
    ...toolset(spec.tools),
    system: spec.system,
    holdTimeoutMs: HOLD_TIMEOUT_MS,
    maxTurns: MAX_TURNS,
    ...(opts.onEvent && { onEvent: opts.onEvent }),
  });
  return {
    run: () => guard.run({ user: env.DEMO_USER, task: spec.task }),
    close: () => gate.close(),
    forced,
    summary: spec.summary,
    task: spec.task,
  };
}
