import type { ToolResult } from "../provider/types.js";

export function blockedResult(callId: string, label: string, reason: string): ToolResult {
  return {
    callId,
    content: `Blocked by Intentlock (${label}): ${reason}. This action is outside what the user asked for.`,
    isError: true,
  };
}

export function rejectedResult(callId: string, holdId: string): ToolResult {
  return {
    callId,
    content: `Blocked by Intentlock (hold ${holdId}): an approver rejected this action. Do not retry it.`,
    isError: true,
  };
}

export function timeoutResult(callId: string, holdId: string): ToolResult {
  return {
    callId,
    content: `Blocked by Intentlock (hold ${holdId}): no approval arrived in time. Do not retry it.`,
    isError: true,
  };
}

export function errorResult(callId: string, message: string): ToolResult {
  return { callId, content: `Tool failed: ${message}`, isError: true };
}

export function okResult(callId: string, output: unknown): ToolResult {
  const content =
    typeof output === "string" ? output : output === undefined ? "" : JSON.stringify(output);
  return { callId, content, isError: false };
}
