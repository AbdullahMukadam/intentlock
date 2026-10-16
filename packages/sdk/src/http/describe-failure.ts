import { DomErrorName } from "../enums/dom-error-name.enum.js";

export function describeNetworkError(err: unknown, timeoutMs: number): string {
  if (!(err instanceof Error)) return String(err);
  if (err.name === DomErrorName.TIMEOUT) return `timed out after ${timeoutMs} ms`;
  const cause = err.cause as { code?: unknown } | undefined;
  return typeof cause?.code === "string" ? cause.code : err.message;
}

export function describeServerAnswer(status: number, body: unknown): string {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const parts = [
    typeof b["error"] === "string" ? b["error"] : null,
    typeof b["requestId"] === "string" ? `request ${b["requestId"]}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? `answered ${status} (${parts.join(", ")})` : `answered ${status}`;
}
