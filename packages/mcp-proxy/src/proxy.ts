import { randomUUID } from "node:crypto";

import {
  BlockReason,
  ClientBlockReason,
  type GateDecision,
  jcs,
  type PlanInput,
  ReportOutcome,
  type ToolCall,
  Verdict,
} from "@intentlock/core";
import { type Gate, type HoldOutcome, HoldStatus, HttpError } from "@intentlock/sdk";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { HttpStatus } from "./enums/http-status.enum.js";
import { ProxyBlockReason } from "./enums/proxy-block-reason.enum.js";

export interface ProxyOptions {
  gate: Gate;
  upstream: Client;
  plan: PlanInput;
  version?: string;
  now?: () => number;
  holdPollMs?: number;
  log?: (line: string) => void;
}

interface Session {
  planId: string;
  token: string;
}

interface PendingHold {
  holdId: string;
  callId: string;
  token: string;
  expiresAt: number;
}

const HOLD_POLL_MS = 2_000;

function text(message: string, isError: boolean): CallToolResult {
  return { content: [{ type: "text", text: message }], isError };
}

function blocked(label: string, reason: string): CallToolResult {
  return text(
    `Blocked by Intentlock (${label}): ${reason}. This action is outside what the user asked for.`,
    true,
  );
}

function held(holdId: string): CallToolResult {
  return text(
    `Held by Intentlock (hold ${holdId}): this action needs approval. Ask the user to approve it in the Intentlock inbox, then make exactly the same call again.`,
    true,
  );
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function gateFailure(err: unknown): ClientBlockReason {
  if (!(err instanceof HttpError)) return ClientBlockReason.SERVER_UNAVAILABLE;
  return err.status === HttpStatus.UNAUTHORIZED
    ? ClientBlockReason.API_KEY_REJECTED
    : ClientBlockReason.GATE_REJECTED;
}

export async function listUpstreamTools(upstream: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await upstream.listTools(cursor === undefined ? {} : { cursor });
    tools.push(...page.tools);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return tools;
}

export function createProxy(opts: ProxyOptions): Server {
  const { gate, upstream, plan } = opts;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? (() => undefined);
  const planned = new Set(plan.steps.map((s) => s.tool));
  const pending = new Map<string, PendingHold>();
  let session: Promise<Session> | undefined;

  const sign = async (): Promise<Session> => {
    const signed = await gate.signPlan(plan);
    log(`signed plan ${signed.planId} (policy v${signed.policyVersion})`);
    return { planId: signed.planId, token: signed.token };
  };

  const current = (): Promise<Session> => {
    session ??= sign().catch((err: unknown) => {
      session = undefined;
      throw err;
    });
    return session;
  };

  const renew = async (expired: Session): Promise<Session> => {
    let next: Session;
    try {
      const refreshed = await gate.refresh(expired.planId, expired.token);
      next = { planId: expired.planId, token: refreshed.token };
    } catch (err) {
      log(`refresh failed (${messageOf(err)}); signing the plan file again`);
      next = await sign();
    }
    session = Promise.resolve(next);
    return next;
  };

  const check = async (call: ToolCall): Promise<{ decision: GateDecision; token: string }> => {
    let token = "";
    try {
      let active = await current();
      token = active.token;
      let decision = await gate.check(token, call);
      if (decision.verdict === Verdict.BLOCK && decision.reason === BlockReason.TOKEN_EXPIRED) {
        active = await renew(active);
        token = active.token;
        decision = await gate.check(token, call);
      }
      return { decision, token };
    } catch (err) {
      log(`check failed for ${call.tool}: ${messageOf(err)}`);
      return {
        decision: { verdict: Verdict.BLOCK, ruleId: null, reason: gateFailure(err) },
        token,
      };
    }
  };

  const forward = async (call: ToolCall, token: string): Promise<CallToolResult> => {
    let result: CallToolResult;
    try {
      result = (await upstream.callTool({
        name: call.tool,
        arguments: call.args,
      })) as CallToolResult;
    } catch (err) {
      result = text(`Tool failed: ${messageOf(err)}`, true);
    }
    try {
      await gate.report(
        token,
        call.callId,
        result.isError ? ReportOutcome.ERROR : ReportOutcome.OK,
      );
    } catch (err) {
      log(`report failed for ${call.tool}: ${messageOf(err)}`);
    }
    return result;
  };

  const resolveHold = async (
    key: string,
    hold: PendingHold,
    call: ToolCall,
  ): Promise<CallToolResult | null> => {
    let outcome: HoldOutcome;
    try {
      outcome = await gate.waitForHold(hold.holdId, { timeoutMs: opts.holdPollMs ?? HOLD_POLL_MS });
    } catch (err) {
      log(`hold ${hold.holdId} could not be checked: ${messageOf(err)}`);
      return blocked(
        ProxyBlockReason.HOLD_UNCONFIRMED,
        `the approval for hold ${hold.holdId} could not be confirmed; try again in a moment`,
      );
    }
    if (outcome === HoldStatus.APPROVED) {
      pending.delete(key);
      return forward({ ...call, callId: hold.callId }, hold.token);
    }
    if (outcome === HoldStatus.REJECTED) {
      pending.delete(key);
      return blocked(
        ProxyBlockReason.HOLD_REJECTED,
        `an approver rejected hold ${hold.holdId}. Do not retry it`,
      );
    }
    if (now() < hold.expiresAt) return held(hold.holdId);
    pending.delete(key);
    return null;
  };

  const handle = async (name: string, args: Record<string, unknown>): Promise<CallToolResult> => {
    const key = jcs({ tool: name, args });
    const call: ToolCall = { tool: name, args, callId: randomUUID() };
    const hold = pending.get(key);
    if (hold) {
      const resolved = await resolveHold(key, hold, call);
      if (resolved) return resolved;
    }
    const { decision, token } = await check(call);
    switch (decision.verdict) {
      case Verdict.ALLOW:
        return forward(call, token);
      case Verdict.HOLD:
        pending.set(key, {
          holdId: decision.holdId,
          callId: call.callId,
          token,
          expiresAt: now() + decision.timeoutSeconds * 1000,
        });
        log(`hold ${decision.holdId} for ${name}`);
        return held(decision.holdId);
      case Verdict.BLOCK:
        log(`blocked ${name}: ${decision.ruleId ?? decision.reason}`);
        return blocked(decision.ruleId ?? decision.reason, decision.reason);
    }
  };

  const server = new Server(
    { name: "intentlock-mcp", version: opts.version ?? "0.0.0" },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await listUpstreamTools(upstream)).filter((t) => planned.has(t.name)),
  }));
  server.setRequestHandler(CallToolRequestSchema, (req) =>
    handle(req.params.name, req.params.arguments ?? {}),
  );
  return server;
}
