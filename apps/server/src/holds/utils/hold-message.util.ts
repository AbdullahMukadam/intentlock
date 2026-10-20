import type { Hold } from "../../generated/prisma/client.js";
import { MAX_NOTIFY_ARGS_CHARS } from "../constants/hold.constants.js";

export type HoldMessageInput = Pick<Hold, "tool" | "user" | "ruleId" | "args" | "expiresAt"> & {
  agent: string;
  link: string;
};

export function holdSubject(m: HoldMessageInput): string {
  return `Approval needed: ${m.tool} from ${m.agent}`;
}

export function holdMessage(m: HoldMessageInput, withArgValues: boolean): string {
  return [
    `Agent "${m.agent}" wants to run ${m.tool} for ${m.user} and is waiting for approval.`,
    "",
    `Rule: ${m.ruleId ?? "-"}`,
    `Expires: ${m.expiresAt.toISOString()}`,
    withArgValues ? `Arguments: ${argValues(m.args)}` : `Argument names: ${argNames(m.args)}`,
    "",
    `Approve or reject: ${m.link}`,
    "",
  ].join("\n");
}

function argValues(args: unknown): string {
  const json = JSON.stringify(args) ?? "null";
  return json.length > MAX_NOTIFY_ARGS_CHARS ? `${json.slice(0, MAX_NOTIFY_ARGS_CHARS)}…` : json;
}

function argNames(args: unknown): string {
  const names =
    args !== null && typeof args === "object" && !Array.isArray(args) ? Object.keys(args) : [];
  return names.length > 0 ? names.join(", ") : "-";
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

function row(label: string, value: string, mono = false): string {
  const font = mono ? "font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;" : "";
  return `<tr><td style="padding:8px 0;color:#6b7280;width:110px;vertical-align:top">${esc(label)}</td><td style="padding:8px 0;color:#111827;${font}">${esc(value)}</td></tr>`;
}

export function holdHtml(m: HoldMessageInput): string {
  const json = JSON.stringify(m.args, null, 2) ?? "null";
  const args =
    json.length > MAX_NOTIFY_ARGS_CHARS ? `${json.slice(0, MAX_NOTIFY_ARGS_CHARS)}…` : json;
  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:12px">
<tr><td style="padding:24px 28px 8px">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#b45309">Approval needed</p>
<h1 style="margin:0;font-size:20px;font-weight:600;color:#111827">${esc(m.agent)} wants to run <span style="font-family:ui-monospace,Menlo,Consolas,monospace">${esc(m.tool)}</span></h1>
<p style="margin:8px 0 0;color:#4b5563">The call is held until someone approves or rejects it. If nobody does, it expires and the tool does not run.</p>
</td></tr>
<tr><td style="padding:12px 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7">
${row("Agent", m.agent)}
${row("For", m.user)}
${row("Tool", m.tool, true)}
${row("Rule", m.ruleId ?? "-", true)}
${row("Expires", m.expiresAt.toUTCString())}
</table>
</td></tr>
<tr><td style="padding:0 28px 8px">
<p style="margin:0 0 6px;color:#6b7280">Arguments</p>
<pre style="margin:0;padding:12px;background:#f9fafb;border:1px solid #e4e4e7;border-radius:8px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#111827;white-space:pre-wrap;word-break:break-word">${esc(args)}</pre>
</td></tr>
<tr><td style="padding:16px 28px 28px">
<a href="${esc(m.link)}" style="display:inline-block;padding:10px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Review hold</a>
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#9ca3af">You get this because you may approve this hold. Turn these emails off on your Intentlock Account page.</p>
</td></tr></table>
</body></html>
`;
}
