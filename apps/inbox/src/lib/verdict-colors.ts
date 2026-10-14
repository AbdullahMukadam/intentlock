import { AuditVerdict } from "./enums/audit-verdict.enum";

export const VERDICT_COLORS: Record<AuditVerdict, string> = {
  [AuditVerdict.ALLOW]: "#0ca30c",
  [AuditVerdict.APPROVED]: "#0ca30c",
  [AuditVerdict.HOLD]: "#fab219",
  [AuditVerdict.EXPIRED]: "#ec835a",
  [AuditVerdict.BLOCK]: "#d03b3b",
  [AuditVerdict.REJECTED]: "#d03b3b",
};

export function verdictColor(verdict: string) {
  return (VERDICT_COLORS as Record<string, string | undefined>)[verdict] ?? "currentColor";
}
