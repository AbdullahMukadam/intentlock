import type { Match, PolicyDraft, Role, Verdict } from "@intentlock/core";

import { ArgOp } from "@/lib/enums/arg-op.enum";
import { InPlanChoice } from "@/lib/enums/in-plan-choice.enum";

export type FormValue = string | number | boolean;

export type FormApprovers = { roles?: Role[]; emails?: string[]; self?: boolean };

export type FormRule = {
  id: string;
  match: Match;
  except?: Match;
  decision: Verdict;
  approvers?: FormApprovers;
  timeoutSeconds?: number;
  reason?: string;
};

export type FormPolicy = { version: 1; default: Verdict.BLOCK; rules: FormRule[] };

export type ArgRow = { name: string; op: ArgOp; value: unknown };

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const LIST_OPS = new Set<ArgOp>([ArgOp.IN, ArgOp.NOT_IN]);
const NUMBER_OPS = new Set<ArgOp>([ArgOp.LTE, ArgOp.GTE]);
const TEXT_OPS = new Set<ArgOp>([ArgOp.GLOB, ArgOp.NOT_GLOB, ArgOp.REGEX]);

export const DEFAULT_HOLD_TIMEOUT = 300;

export function toFormPolicy(policy: PolicyDraft): FormPolicy {
  return policy as FormPolicy;
}

export function toPolicyDraft(policy: FormPolicy): PolicyDraft {
  return policy as PolicyDraft;
}

export function parseScalar(text: string): FormValue {
  const t = text.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (NUMBER.test(t)) return Number(t);
  return text;
}

export function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function joinList(items: readonly unknown[] | undefined): string {
  return (items ?? []).map(String).join(", ");
}

export function valueFromText(op: ArgOp, text: string): unknown {
  if (LIST_OPS.has(op)) return splitList(text).map(parseScalar);
  if (NUMBER_OPS.has(op)) return text.trim() === "" ? text : Number(text);
  if (TEXT_OPS.has(op)) return text;
  return parseScalar(text);
}

export function textFromValue(op: ArgOp, value: unknown): string {
  if (LIST_OPS.has(op)) return Array.isArray(value) ? joinList(value) : "";
  return value === undefined ? "" : String(value);
}

export function argRows(args: Match["args"]): ArgRow[] {
  return Object.entries(args ?? {}).map(([name, condition]) => {
    const [op, value] = Object.entries(condition)[0] ?? [ArgOp.EQ, ""];
    return { name, op: op as ArgOp, value };
  });
}

export function argsFromRows(rows: ArgRow[]): Match["args"] {
  if (rows.length === 0) return undefined;
  return Object.fromEntries(rows.map((r) => [r.name, { [r.op]: r.value }])) as Match["args"];
}

function scalarFits(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value !== "string" && typeof value !== "number") return false;
  return parseScalar(String(value)) === value;
}

function listItemFits(value: unknown): boolean {
  if (typeof value !== "string") return scalarFits(value);
  return scalarFits(value) && value.trim() === value && value !== "" && !value.includes(",");
}

function valueFits(op: ArgOp, value: unknown): boolean {
  if (LIST_OPS.has(op)) return Array.isArray(value) && value.every(listItemFits);
  if (NUMBER_OPS.has(op)) return typeof value === "number";
  if (TEXT_OPS.has(op)) return typeof value === "string";
  return scalarFits(value);
}

function matchFits(match: Match | undefined): boolean {
  if (!match) return true;
  return argRows(match.args).every((r) => valueFits(r.op, r.value));
}

export function ruleFitsForm(rule: FormRule): boolean {
  return matchFits(rule.match) && matchFits(rule.except);
}

export function toolsOf(match: Match): string[] {
  if (match.tool === undefined) return [];
  return Array.isArray(match.tool) ? match.tool : [match.tool];
}

export function toolFromList(tools: string[]): Match["tool"] {
  if (tools.length === 0) return undefined;
  return tools.length === 1 ? tools[0] : tools;
}

export function inPlanChoice(match: Match): InPlanChoice {
  if (match.inPlan === undefined) return InPlanChoice.ANY;
  return match.inPlan ? InPlanChoice.IN_PLAN : InPlanChoice.OFF_PLAN;
}

export function inPlanValue(choice: InPlanChoice): boolean | undefined {
  if (choice === InPlanChoice.ANY) return undefined;
  return choice === InPlanChoice.IN_PLAN;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

export function newRuleId(rules: FormRule[]): string {
  const ids = new Set(rules.map((r) => r.id));
  let n = rules.length + 1;
  while (ids.has(`rule-${n}`)) n++;
  return `rule-${n}`;
}
