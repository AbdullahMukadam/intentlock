import { Badge, type BadgeTone as Tone } from "@intentlock/ui/components/badge";

import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";

const TONES: Record<AuditVerdict, Tone> = {
  [AuditVerdict.ALLOW]: "success",
  [AuditVerdict.APPROVED]: "success",
  [AuditVerdict.BLOCK]: "danger",
  [AuditVerdict.REJECTED]: "danger",
  [AuditVerdict.HOLD]: "warning",
  [AuditVerdict.EXPIRED]: "neutral",
};

export function verdictTone(verdict: string): Tone {
  return (TONES as Record<string, Tone | undefined>)[verdict.toLowerCase()] ?? "neutral";
}

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict)
    return (
      <span data-empty className="text-muted-foreground">
        —
      </span>
    );
  return (
    <Badge tone={verdictTone(verdict)} className="capitalize">
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {verdict.toLowerCase()}
    </Badge>
  );
}
