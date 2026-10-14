import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@intentlock/ui/components/card";
import Link from "next/link";

import { VerdictBadge } from "@/components/verdict-badge";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import { formatDuration } from "@/lib/format";
import type { Overview } from "@/lib/schemas";

function Tile({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

export function StatTiles({ overview: o }: { overview: Overview }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
      <Tile label={<VerdictBadge verdict={AuditVerdict.ALLOW} />} value={o.totals.allow} />
      <Tile label={<VerdictBadge verdict={AuditVerdict.BLOCK} />} value={o.totals.block} />
      <Tile label={<VerdictBadge verdict={AuditVerdict.HOLD} />} value={o.totals.hold} />
      <Tile
        label="Pending holds"
        value={
          <Link href="/holds" className="underline-offset-4 hover:underline">
            {o.pendingHolds}
          </Link>
        }
      />
      <Tile label="Median time to approve" value={formatDuration(o.medianApprovalSeconds)} />
      <Tile label="Flagged entries" value={o.flagged} hint="Client decisions looser than policy" />
      <Tile
        label="Audit lag"
        value={formatDuration(o.auditLag?.avgSeconds)}
        hint={o.auditLag ? `max ${formatDuration(o.auditLag.maxSeconds)}` : "No hybrid entries"}
      />
    </div>
  );
}
