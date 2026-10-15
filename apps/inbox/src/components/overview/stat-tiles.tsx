import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { Gauge } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { formatDuration } from "@/lib/format";
import type { Overview } from "@/lib/schemas";

function Stat({
  label,
  value,
  hint,
  href,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  hint: string;
  href?: Route;
  alert?: boolean;
}) {
  const content = (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1.5 text-xl font-semibold tracking-tight tabular-nums",
          alert && "text-destructive",
        )}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">{hint}</div>
    </>
  );
  return href ? (
    <Link href={href} className="block p-4 hover:bg-muted/40">
      {content}
    </Link>
  ) : (
    <div className="p-4">{content}</div>
  );
}

export function StatTiles({ overview: o }: { overview: Overview }) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Gauge />
          Operations
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="grid grid-cols-2 divide-x divide-y overflow-hidden p-0 md:grid-cols-4 md:divide-y-0">
        <Stat
          label="Pending holds"
          value={o.pendingHolds}
          hint={o.pendingHolds ? "Waiting for an approver" : "Nothing waiting"}
          href="/holds"
          alert={o.pendingHolds > 0}
        />
        <Stat
          label="Median time to approve"
          value={formatDuration(o.medianApprovalSeconds)}
          hint="From hold to decision"
        />
        <Stat
          label="Flagged entries"
          value={o.flagged}
          hint="Client decisions looser than policy"
          alert={o.flagged > 0}
        />
        <Stat
          label="Audit upload lag"
          value={formatDuration(o.auditLag?.avgSeconds)}
          hint={o.auditLag ? `max ${formatDuration(o.auditLag.maxSeconds)}` : "No hybrid entries"}
        />
      </PanelBody>
    </Panel>
  );
}
