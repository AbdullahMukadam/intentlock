import { HoldStatus, jcs } from "@intentlock/core";
import { z } from "zod";

import { MessageRole } from "../provider/enums/message-role.enum.js";
import type { Message, ToolCallReq, ToolResult } from "../provider/types.js";
import { Checkpoint, CheckpointError } from "./checkpoint.js";
import { EventType } from "./enums/event-type.enum.js";
import { settleHold } from "./execute.js";
import { type LoopContext, runLoop, type RunResult, suspendedResult } from "./loop.js";

export function parseCheckpoint(raw: unknown): Checkpoint {
  const parsed = Checkpoint.safeParse(raw);
  if (!parsed.success) {
    throw new CheckpointError(`Invalid checkpoint: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

const REFRESH_MARGIN_MS = 60_000;

export function tokenNeedsRefresh(token: string, now: Date): boolean {
  try {
    const payload = token.split(".")[1];
    if (!payload) return true;
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof exp !== "number") return true;
    return exp * 1000 - now.getTime() <= REFRESH_MARGIN_MS;
  } catch {
    return true;
  }
}

async function refreshToken(ctx: LoopContext, session: { planId: string; token: string }) {
  try {
    session.token = (await ctx.gate.refresh(session.planId, session.token)).token;
  } catch (err) {
    ctx.emit({
      type: EventType.ERROR,
      planId: session.planId,
      reason: `token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

export async function resumeRun(ctx: LoopContext, cp: Checkpoint): Promise<RunResult> {
  const lookup = ctx.gate.holdInfo?.bind(ctx.gate);
  if (!lookup) throw new CheckpointError("This gate cannot look up holds, so it cannot resume");
  const messages = cp.messages as Message[];
  const last = messages.at(-1);
  const calls: ToolCallReq[] = last?.role === MessageRole.ASSISTANT ? (last.toolCalls ?? []) : [];

  const infos = await Promise.all(cp.held.map((h) => lookup(h.holdId)));
  for (const [i, h] of cp.held.entries()) {
    const info = infos[i]!;
    const call = calls[h.index]!;
    const same =
      info.planId === cp.planId &&
      info.callId === call.id &&
      info.tool === call.name &&
      jcs(info.args) === jcs(call.args);
    if (!same) {
      throw new CheckpointError(`Checkpoint does not match hold ${h.holdId}; refusing to resume`);
    }
  }
  if (infos.some((info) => info.status === HoldStatus.PENDING)) return suspendedResult(cp);

  const session = { planId: cp.planId, token: cp.token, user: cp.user };
  if (cp.gate && ctx.gate.importPlan) await ctx.gate.importPlan(cp.planId, cp.gate);
  if (tokenNeedsRefresh(cp.token, ctx.now())) await refreshToken(ctx, session);

  const results = [...cp.results];
  for (const [i, h] of cp.held.entries()) {
    const status = infos[i]!.status as Exclude<HoldStatus, HoldStatus.PENDING>;
    results[h.index] = await settleHold(ctx, session, calls[h.index]!, h.ruleId, h.holdId, status);
  }
  messages.push({ role: MessageRole.TOOL, results: results as ToolResult[] });
  return runLoop(ctx, session, messages, cp.turn + 1);
}
