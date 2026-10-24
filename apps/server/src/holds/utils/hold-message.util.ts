import type { Hold } from "../../generated/prisma/client.js";
import { emailHtml } from "../../mail/utils/email-layout.util.js";
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

export function holdHtml(m: HoldMessageInput): string {
  const json = JSON.stringify(m.args, null, 2) ?? "null";
  const args =
    json.length > MAX_NOTIFY_ARGS_CHARS ? `${json.slice(0, MAX_NOTIFY_ARGS_CHARS)}…` : json;
  return emailHtml({
    preheader: `${m.agent} is waiting for approval to run ${m.tool} for ${m.user}.`,
    eyebrow: "Approval needed",
    accent: "#b45309",
    title: `${m.agent} wants to run ${m.tool}`,
    intro:
      "The call is held until someone approves or rejects it. If nobody does before it expires, the tool does not run.",
    details: [
      { label: "Agent", value: m.agent },
      { label: "For", value: m.user },
      { label: "Tool", value: m.tool, mono: true },
      { label: "Rule", value: m.ruleId ?? "-", mono: true },
      { label: "Expires", value: m.expiresAt.toUTCString() },
    ],
    code: { label: "Arguments", value: args },
    button: { label: "Review hold", href: m.link },
    footer:
      "You get this because you may approve this hold. Turn these emails off on your Intentlock Account page.",
  });
}
