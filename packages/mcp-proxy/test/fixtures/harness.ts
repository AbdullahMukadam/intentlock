import {
  type GateDecision,
  generateSigningKeyPair,
  parsePolicy,
  type PlanInput,
  type ReportOutcome,
  type ToolCall,
  Verdict,
} from "@intentlock/core";
import { type Gate, type HoldOutcome, HoldStatus, LocalGate } from "@intentlock/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { createProxy } from "../../src/proxy.js";

export const USER = "sam@acme.dev";
export const REPO = "acme/app";

export const PLAN: PlanInput = {
  version: 1,
  goal: "Triage acme/app",
  user: USER,
  steps: [
    { tool: "list_issues", args: { repo: { eq: REPO } } },
    { tool: "add_comment", args: { repo: { eq: REPO } } },
    { tool: "merge_pr", args: { repo: { eq: REPO } } },
    { tool: "flaky" },
  ],
};

const POLICY = `version: 1
default: block
rules:
  - id: no-links
    match: { tool: add_comment, args: { body: { regex: ".*https?://.*" } } }
    decision: block
    reason: Comments never contain links
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const UPSTREAM_TOOLS = ["list_issues", "add_comment", "merge_pr", "flaky", "delete_repo"];

export class ScriptedGate implements Gate {
  readonly reports: { callId: string; outcome: ReportOutcome }[] = [];
  readonly holdTools = new Set<string>(["merge_pr"]);
  readonly holds = new Map<string, HoldOutcome | "pending">();
  signs = 0;
  refreshFails = false;
  checkFails = false;
  #next = 0;

  constructor(readonly local: LocalGate) {}

  async signPlan(plan: PlanInput) {
    this.signs++;
    return this.local.signPlan(plan);
  }

  async refresh(planId: string, token: string) {
    if (this.refreshFails) throw new Error("token too old to refresh");
    return this.local.refresh(planId, token);
  }

  async check(token: string, call: ToolCall): Promise<GateDecision> {
    if (this.checkFails) throw new Error("connect ECONNREFUSED");
    const decision = await this.local.check(token, call);
    if (decision.verdict !== Verdict.ALLOW || !this.holdTools.has(call.tool)) return decision;
    const holdId = `hold_${++this.#next}`;
    this.holds.set(holdId, "pending");
    return {
      verdict: Verdict.HOLD,
      ruleId: "hold-merges",
      planStep: decision.planStep,
      approvers: { roles: ["approver"], emails: [], self: false },
      timeoutSeconds: 600,
      holdId,
    };
  }

  async waitForHold(holdId: string): Promise<HoldOutcome> {
    const state = this.holds.get(holdId);
    return state === undefined || state === "pending" ? HoldStatus.EXPIRED : state;
  }

  async report(_token: string, callId: string, outcome: ReportOutcome) {
    this.reports.push({ callId, outcome });
  }

  async close() {}
}

export async function setup(plan: PlanInput = PLAN) {
  const parsed = parsePolicy(POLICY);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  let clock = Date.parse("2026-10-19T10:00:00Z");
  const local = new LocalGate({
    privateKey: (await generateSigningKeyPair()).privateKey,
    policies: parsed.policy,
    now: () => new Date(clock),
    ttlSeconds: 60,
  });
  const gate = new ScriptedGate(local);

  const upstreamCalls: { name: string; args: unknown }[] = [];
  const upstreamServer = new Server(
    { name: "fake-upstream", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  upstreamServer.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: UPSTREAM_TOOLS.map((name) => ({
      name,
      description: `${name} tool`,
      inputSchema: { type: "object" as const },
    })),
  }));
  upstreamServer.setRequestHandler(CallToolRequestSchema, async (req) => {
    upstreamCalls.push({ name: req.params.name, args: req.params.arguments });
    if (req.params.name === "flaky") {
      return { content: [{ type: "text", text: "rate limited" }], isError: true };
    }
    return { content: [{ type: "text", text: `${req.params.name} ok` }] };
  });
  const [upstreamA, upstreamB] = InMemoryTransport.createLinkedPair();
  await upstreamServer.connect(upstreamA);
  const upstream = new Client({ name: "proxy", version: "1.0.0" });
  await upstream.connect(upstreamB);

  const logs: string[] = [];
  const proxy = createProxy({
    gate,
    upstream,
    plan,
    now: () => clock,
    holdPollMs: 10,
    log: (line) => logs.push(line),
  });
  const [proxyA, proxyB] = InMemoryTransport.createLinkedPair();
  await proxy.connect(proxyA);
  const client = new Client({ name: "claude", version: "1.0.0" });
  await client.connect(proxyB);

  const call = async (name: string, args: Record<string, unknown> = { repo: REPO }) => {
    const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
    const first = result.content[0];
    return { isError: result.isError === true, text: first?.type === "text" ? first.text : "" };
  };

  return {
    gate,
    client,
    call,
    upstreamCalls,
    logs,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}
