import { HoldResolveOutcome } from "@intentlock/core";

import type { BulkResolveResult } from "./schemas";

const SKIP_LABEL: Partial<Record<HoldResolveOutcome, string>> = {
  [HoldResolveOutcome.EXPIRED]: "expired",
  [HoldResolveOutcome.NOT_PENDING]: "already resolved",
  [HoldResolveOutcome.NOT_AN_APPROVER]: "not yours to approve",
  [HoldResolveOutcome.NOT_FOUND]: "not found",
};

export function bulkSummary(result: BulkResolveResult, approve: boolean) {
  const head = `${approve ? "Approved" : "Rejected"} ${result.resolved}`;
  if (result.skipped === 0) return head;
  const counts = new Map<string, number>();
  for (const { outcome } of result.results) {
    const label = SKIP_LABEL[outcome];
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const reasons = [...counts].map(([label, n]) => `${n} ${label}`).join(", ");
  return `${head}, skipped ${result.skipped} (${reasons})`;
}
