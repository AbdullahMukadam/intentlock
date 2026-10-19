import { Plan, type PlanInput } from "@intentlock/core";
import { z } from "zod";

export const PlanFile = Plan.pick({ goal: true, steps: true });

export function planFromFile(source: string, user: string): PlanInput {
  let json: unknown;
  try {
    json = JSON.parse(source);
  } catch (err) {
    throw new Error(
      `Plan file is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }
  const file = PlanFile.safeParse(json);
  if (!file.success) throw new Error(`Invalid plan file:\n${z.prettifyError(file.error)}`);
  const plan = Plan.safeParse({ version: 1, user, ...file.data });
  if (!plan.success) throw new Error(`Invalid plan:\n${z.prettifyError(plan.error)}`);
  return plan.data;
}
