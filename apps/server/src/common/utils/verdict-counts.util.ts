import { AuditVerdict } from "../../audit/enums/audit-verdict.enum.js";
import type { VerdictCounts } from "../types/verdict-counts.type.js";

export function emptyVerdictCounts(): VerdictCounts {
  return { allow: 0, block: 0, hold: 0 };
}

export function tallyVerdicts<R extends { verdict: string | null; _count: { _all: number } }>(
  rows: R[],
  keyOf: (row: R) => string | null,
): Map<string, VerdictCounts> {
  const counts = new Map<string, VerdictCounts>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const c = counts.get(key) ?? emptyVerdictCounts();
    if (row.verdict === AuditVerdict.ALLOW) c.allow += row._count._all;
    if (row.verdict === AuditVerdict.BLOCK) c.block += row._count._all;
    if (row.verdict === AuditVerdict.HOLD) c.hold += row._count._all;
    counts.set(key, c);
  }
  return counts;
}
