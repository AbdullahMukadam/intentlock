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
