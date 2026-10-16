"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import { PanelBody } from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import { Flag, ListFilter, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { VerdictBadge } from "@/components/verdict-badge";
import { type ActivityFilters, toAuditQuery } from "@/lib/activity-filters";
import { apiUrl, request } from "@/lib/api";
import { formatShortTime, formatTime, humanize } from "@/lib/format";
import { type AgentSummary, AuditPage, type AuditRow } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HEADERS = ["#", "Time", "Event", "Agent", "User", "Tool", "Verdict", "Rule", "Policy", "Run"];

function Dash() {
  return (
    <span data-empty className="text-muted-foreground/60">
      —
    </span>
  );
}

export function DecisionTable({
  filters,
  agents,
}: {
  filters: ActivityFilters;
  agents: AgentSummary[];
}) {
  const query = toAuditQuery(filters);
  const first = useApi(apiUrl(API_ENDPOINTS.AUDIT, { query }), AuditPage);
  const [more, setMore] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);

  if (first.error) {
    return (
      <PanelBody className="p-0">
        <EmptyState
          icon={TriangleAlert}
          title="Could not load activity"
          description="The server did not answer. Reload the page to try again."
        />
      </PanelBody>
    );
  }
  if (!first.data) {
    return (
      <PanelBody className="grid gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </PanelBody>
    );
  }

  const names = new Map(agents.map((a) => [a.id, a.name]));
  const rows = [...first.data.entries, ...more];
  const next = cursor === undefined ? first.data.nextCursor : cursor;

  async function loadMore() {
    if (next == null) return;
    setLoadingMore(true);
    try {
      const page = await request(
        apiUrl(API_ENDPOINTS.AUDIT, { query: { ...query, cursor: next } }),
        AuditPage,
      );
      setMore((m) => [...m, ...page.entries]);
      setCursor(page.nextCursor);
    } catch {
      toast.error("Could not load more entries.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (rows.length === 0) {
    return (
      <PanelBody className="p-0">
        <EmptyState
          icon={ListFilter}
          title="No matching decisions"
          description="Nothing was recorded for these filters. Widen the time range or reset the filters."
        />
      </PanelBody>
    );
  }

  return (
    <PanelBody className="overflow-hidden p-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {HEADERS.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.seq}>
              <TableCell label="#" className="font-mono text-xs text-muted-foreground tabular-nums">
                <span className="inline-flex items-center gap-1">
                  {r.seq}
                  {r.flagged && (
                    <Flag
                      aria-label={`Flagged: ${r.flagged}`}
                      className="size-3 text-destructive"
                    />
                  )}
                </span>
              </TableCell>
              <TableCell
                label="Time"
                className="text-muted-foreground tabular-nums"
                title={formatTime(r.at)}
              >
                {formatShortTime(r.at)}
              </TableCell>
              <TableCell label="Event" className="capitalize">
                {humanize(r.kind)}
              </TableCell>
              <TableCell label="Agent">
                {r.agentId ? (names.get(r.agentId) ?? r.agentId) : <Dash />}
              </TableCell>
              <TableCell label="User">{r.user ?? <Dash />}</TableCell>
              <TableCell label="Tool" className="font-mono text-xs">
                {r.tool ?? <Dash />}
              </TableCell>
              <TableCell label="Verdict">
                <VerdictBadge verdict={r.verdict} />
              </TableCell>
              <TableCell label="Rule" className="font-mono text-xs text-muted-foreground">
                {r.ruleId ?? <Dash />}
              </TableCell>
              <TableCell label="Policy">
                {r.policyVersion ? <Badge>v{r.policyVersion}</Badge> : <Dash />}
              </TableCell>
              <TableCell label="Run">
                {r.planId ? (
                  <Link
                    href={`/runs/${r.planId}`}
                    className="font-mono text-xs font-medium underline-offset-4 hover:underline"
                  >
                    {r.planId.slice(0, 8)}
                  </Link>
                ) : (
                  <Dash />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span>
          {rows.length} {rows.length === 1 ? "entry" : "entries"}
          {next != null && " shown"}
        </span>
        {next != null && (
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </div>
    </PanelBody>
  );
}
