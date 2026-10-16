import {
  BlockReason,
  ClientBlockReason,
  type GateDecision,
  ReportOutcome,
  Verdict,
} from "@intentlock/core";
import { type Gate, type HoldOutcome, HoldStatus, HttpError } from "@intentlock/sdk";

import type { ToolCallReq, ToolResult } from "../provider/types.js";
import { EventType } from "./enums/event-type.enum.js";
import { GuardBlockReason } from "./enums/guard-block-reason.enum.js";
import { HttpStatus } from "./enums/http-status.enum.js";
import type { EventSink } from "./events.js";
import type { ToolImpl } from "./options.js";
import {
  blockedResult,
  errorResult,
  holdUnconfirmedResult,
  okResult,
  rejectedResult,
  timeoutResult,
} from "./results.js";

export interface GuardSession {
  planId: string;
  token: string;
  user: string;
}

export interface ExecuteContext {
  gate: Gate;
  impls: Record<string, ToolImpl>;
  holdTimeoutMs: number;
  emit: EventSink;
  now: () => Date;
}

const refreshing = new WeakMap<GuardSession, { from: string; done: Promise<boolean> }>();

function refreshOnce(gate: Gate, session: GuardSession, expired: string): Promise<boolean> {
  if (session.token !== expired) return Promise.resolve(true);
  const inflight = refreshing.get(session);
  if (inflight?.from === expired) return inflight.done;
  const done = gate.refresh(session.planId, expired).then(
    (r) => {
      session.token = r.token;
      return true;
    },
    () => false,
  );
  refreshing.set(session, { from: expired, done });
  return done;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function gateFailureReason(err: unknown): ClientBlockReason {
  if (!(err instanceof HttpError)) return ClientBlockReason.SERVER_UNAVAILABLE;
  return err.status === HttpStatus.UNAUTHORIZED
    ? ClientBlockReason.API_KEY_REJECTED
    : ClientBlockReason.GATE_REJECTED;
}

async function safeCheck(
  ctx: ExecuteContext,
  session: GuardSession,
  token: string,
  call: ToolCallReq,
): Promise<GateDecision> {
  try {
    return await ctx.gate.check(token, { tool: call.name, args: call.args, callId: call.id });
  } catch (err) {
    ctx.emit({
      type: EventType.ERROR,
      planId: session.planId,
      tool: call.name,
      reason: `check failed: ${messageOf(err)}`,
    });
    return { verdict: Verdict.BLOCK, ruleId: null, reason: gateFailureReason(err) };
  }
}

async function decide(ctx: ExecuteContext, session: GuardSession, call: ToolCallReq) {
  const token = session.token;
  const first = await safeCheck(ctx, session, token, call);
  if (first.verdict !== Verdict.BLOCK || first.reason !== BlockReason.TOKEN_EXPIRED) return first;
  if (!(await refreshOnce(ctx.gate, session, token))) return first;
  return safeCheck(ctx, session, session.token, call);
}

async function waitSafely(
  ctx: ExecuteContext,
  session: GuardSession,
  call: ToolCallReq,
  holdId: string,
): Promise<HoldOutcome | null> {
  try {
    return await ctx.gate.waitForHold(holdId, { timeoutMs: ctx.holdTimeoutMs });
  } catch (err) {
    ctx.emit({
      type: EventType.ERROR,
      planId: session.planId,
      tool: call.name,
      holdId,
      reason: `hold wait failed: ${messageOf(err)}`,
    });
    return null;
  }
}

async function runImpl(
  ctx: ExecuteContext,
  session: GuardSession,
  call: ToolCallReq,
  impl: ToolImpl,
): Promise<ToolResult> {
  let result: ToolResult;
  let outcome: ReportOutcome;
  try {
    result = okResult(call.id, await impl(call.args));
    outcome = ReportOutcome.OK;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.emit({ type: EventType.ERROR, planId: session.planId, tool: call.name, reason: message });
    result = errorResult(call.id, message);
    outcome = ReportOutcome.ERROR;
  }
  try {
    await ctx.gate.report(session.token, call.id, outcome);
  } catch (err) {
    ctx.emit({
      type: EventType.ERROR,
      planId: session.planId,
      tool: call.name,
      reason: `report failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  return result;
}

async function executeOne(
  ctx: ExecuteContext,
  session: GuardSession,
  call: ToolCallReq,
): Promise<ToolResult> {
  const base = { planId: session.planId, tool: call.name, args: call.args };
  const impl = Object.hasOwn(ctx.impls, call.name) ? ctx.impls[call.name] : undefined;
  if (!impl) {
    ctx.emit({
      type: EventType.BLOCK,
      ...base,
      ruleId: null,
      reason: GuardBlockReason.UNKNOWN_TOOL,
    });
    return blockedResult(
      call.id,
      GuardBlockReason.UNKNOWN_TOOL,
      `there is no tool named ${call.name}`,
    );
  }
  if (call.argsError) {
    ctx.emit({
      type: EventType.BLOCK,
      ...base,
      ruleId: null,
      reason: GuardBlockReason.INVALID_ARGS,
    });
    return blockedResult(call.id, GuardBlockReason.INVALID_ARGS, call.argsError);
  }

  const started = performance.now();
  const decision = await decide(ctx, session, call);
  const latencyMs = performance.now() - started;

  switch (decision.verdict) {
    case Verdict.BLOCK:
      ctx.emit({
        type: EventType.BLOCK,
        ...base,
        ruleId: decision.ruleId,
        reason: decision.reason,
        latencyMs,
      });
      return blockedResult(call.id, decision.ruleId ?? decision.reason, decision.reason);
    case Verdict.ALLOW:
      ctx.emit({ type: EventType.ALLOW, ...base, ruleId: decision.ruleId, latencyMs });
      return runImpl(ctx, session, call, impl);
    case Verdict.HOLD: {
      const holdId = decision.holdId;
      ctx.emit({ type: EventType.HOLD, ...base, ruleId: decision.ruleId, holdId, latencyMs });
      const outcome = await waitSafely(ctx, session, call, holdId);
      if (outcome === null) return holdUnconfirmedResult(call.id, holdId);
      if (outcome === HoldStatus.APPROVED) {
        ctx.emit({ type: EventType.APPROVED, ...base, ruleId: decision.ruleId, holdId });
        return runImpl(ctx, session, call, impl);
      }
      if (outcome === HoldStatus.REJECTED) {
        ctx.emit({ type: EventType.REJECTED, ...base, ruleId: decision.ruleId, holdId });
        return rejectedResult(call.id, holdId);
      }
      ctx.emit({ type: EventType.TIMEOUT, ...base, ruleId: decision.ruleId, holdId });
      return timeoutResult(call.id, holdId);
    }
  }
}

export function executeCalls(
  ctx: ExecuteContext,
  session: GuardSession,
  calls: ToolCallReq[],
): Promise<ToolResult[]> {
  return Promise.all(calls.map((call) => executeOne(ctx, session, call)));
}
