import { minimatch } from "minimatch";

import { jcs } from "../canonical.js";
import type { ArgCondition, PlanStep } from "../schemas/plan.js";
import type { ToolCall } from "../schemas/tool-call.js";

const GLOB_OPTIONS = { dot: true, nonegate: true, nocomment: true } as const;

export function globMatch(value: string, pattern: string, nocase = false): boolean {
  return minimatch(value, pattern, { ...GLOB_OPTIONS, nocase });
}

function isPresent(args: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(args, key) && args[key] !== undefined;
}

function jsonEquals(a: unknown, b: unknown): boolean {
  try {
    return jcs(a) === jcs(b);
  } catch {
    return false;
  }
}

// ADR-028: positive operators need a present, correctly typed value; notIn/notGlob are exact negations.
export function matchArg(cond: ArgCondition, args: Record<string, unknown>, key: string): boolean {
  if ("notIn" in cond) return !matchArg({ in: cond.notIn }, args, key);
  if ("notGlob" in cond) return !matchArg({ glob: cond.notGlob }, args, key);
  if (!isPresent(args, key)) return false;
  const value = args[key];
  if ("eq" in cond) return jsonEquals(value, cond.eq);
  if ("in" in cond) return cond.in.some((v) => jsonEquals(value, v));
  if ("glob" in cond) return typeof value === "string" && globMatch(value, cond.glob);
  // Full match, so a pattern can't accidentally allow a value that merely contains it.
  if ("regex" in cond)
    return typeof value === "string" && new RegExp(`^(?:${cond.regex})$`, "u").test(value);
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  if ("lte" in cond) return value <= cond.lte;
  return value >= cond.gte;
}

export function matchStep(step: PlanStep, call: ToolCall): boolean {
  if (step.tool !== call.tool) return false;
  return Object.entries(step.args ?? {}).every(([key, cond]) => matchArg(cond, call.args, key));
}
