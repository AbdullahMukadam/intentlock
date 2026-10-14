import type { Diagnostic } from "@codemirror/lint";
import { parsePolicy } from "@intentlock/core";

function offset(lineStarts: number[], length: number, line: number, col: number) {
  const start = lineStarts[Math.min(Math.max(line, 1), lineStarts.length) - 1] ?? 0;
  return Math.min(start + Math.max(col, 1) - 1, length);
}

export function policyDiagnostics(source: string): Diagnostic[] {
  const parsed = parsePolicy(source);
  if (parsed.ok) return [];
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
  return parsed.errors.map((e) => {
    const from = offset(lineStarts, source.length, e.line, e.col);
    const lineEnd = source.indexOf("\n", from);
    return {
      from,
      to: Math.max(from, lineEnd === -1 ? source.length : lineEnd),
      severity: "error",
      message: e.path ? `${e.path}: ${e.message}` : e.message,
    };
  });
}
