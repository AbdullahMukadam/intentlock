import { Plan, ReportOutcome } from "@intentlock/core";

import { AuditKind } from "../../audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../../audit/enums/audit-verdict.enum.js";
import { PlanStatus } from "../../generated/prisma/client.js";
import type { OrgTx } from "../../org/utils/org-db.util.js";
import { CheckedCallSchema } from "../schemas/checked-call.schema.js";

export async function findCheckedCall(tx: OrgTx, planId: string, callId: string) {
  const checked = await tx.auditEntry.findFirst({
    where: {
      planId,
      kind: AuditKind.CHECK,
      verdict: { in: [AuditVerdict.ALLOW, AuditVerdict.HOLD] },
      payload: { path: ["call", "callId"], equals: callId },
    },
    orderBy: { seq: "desc" },
  });
  const parsed = CheckedCallSchema.safeParse(checked?.payload);
  return checked && parsed.success
    ? { step: parsed.data.decision.planStep, tool: checked.tool }
    : null;
}

export async function recordRun(
  tx: OrgTx,
  planId: string,
  callId: string,
  step: number,
  outcome: ReportOutcome,
): Promise<boolean> {
  const already = await tx.auditEntry.findFirst({
    where: { planId, kind: AuditKind.REPORT, payload: { path: ["callId"], equals: callId } },
  });
  if (already) return false;
  if (outcome === ReportOutcome.OK) {
    await tx.stepUsage.updateMany({ where: { planId, step }, data: { ran: { increment: 1 } } });
  }
  return true;
}

export async function updateCompletion(tx: OrgTx, planId: string): Promise<string> {
  const plan = await tx.plan.findFirstOrThrow({ where: { id: planId } });
  const required = (Plan.safeParse(plan.body).data?.steps ?? [])
    .map((s, i) => (s.required ? i : -1))
    .filter((i) => i >= 0);
  if (plan.status !== PlanStatus.ACTIVE || required.length === 0) return plan.status.toLowerCase();
  const done = await tx.stepUsage.count({
    where: { planId, step: { in: required }, ran: { gt: 0 } },
  });
  if (done < required.length) return plan.status.toLowerCase();
  await tx.plan.updateMany({
    where: { id: planId, status: PlanStatus.ACTIVE },
    data: { status: PlanStatus.COMPLETED },
  });
  return PlanStatus.COMPLETED.toLowerCase();
}
