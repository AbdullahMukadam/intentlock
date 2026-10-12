import { type Plan, PlanStatus } from "../../generated/prisma/client.js";
import { RunStatus } from "../enums/run-status.enum.js";

export function runStatus(plan: Pick<Plan, "status" | "expiresAt">, now = new Date()): RunStatus {
  if (plan.status === PlanStatus.COMPLETED) return RunStatus.COMPLETED;
  if (plan.status === PlanStatus.EXPIRED || plan.expiresAt <= now) return RunStatus.EXPIRED;
  return RunStatus.ACTIVE;
}
