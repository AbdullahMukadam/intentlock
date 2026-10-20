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
import { cn } from "@intentlock/ui/lib/utils";
import { ChevronLeft, ChevronRight, Flag, ListFilter, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MemberLabel } from "@/components/member-label";
import { EmptyState } from "@/components/empty-state";
import { VerdictBadge } from "@/components/verdict-badge";
import { NativeSelect } from "@/components/native-select";
import { type ActivityFilters, toAuditQuery } from "@/lib/activity-filters";
import { activityHref, pageCount, pageNumbers, type Paging } from "@/lib/activity-paging";
import { apiUrl } from "@/lib/api";
import { ACTIVITY_PAGE_SIZES } from "@/lib/constants";
import { formatShortTime, formatTime, humanize } from "@/lib/format";
import { type AgentSummary, AuditPage } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HEADERS = ["#", "Time", "Event", "Agent", "User", "Tool", "Verdict", "Rule", "Policy", "Run"];

function Dash() {
  return (
    <span data-empty className="text-muted-foreground/60">
      —
    </span>
  );
}

function Pager({
  filters,
  paging,
  total,
}: {
  filters: ActivityFilters;
  paging: Paging;
  total: number;
}) {
  const router = useRouter();
  const last = pageCount(total, paging.size);
  const from = total === 0 ? 0 : (paging.page - 1) * paging.size + 1;
  const to = Math.min(paging.page * paging.size, total);
  const href = (page: number) => activityHref(filters, { ...paging, page });
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground">
      <span className="tabular-nums">
        {from > to
          ? `Page ${paging.page} of ${last}`
          : `${from}–${to} of ${total.toLocaleString()}`}
      </span>
      <nav aria-label="Pages" className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={paging.page <= 1}
          nativeButton={false}
          render={paging.page > 1 ? <Link href={href(paging.page - 1)} /> : <span />}
        >
          <ChevronLeft />
        </Button>
        {pageNumbers(Math.min(paging.page, last), last).map((n, i) =>
          n === null ? (
            <span key={`gap${i}`} className="px-1">
              …
            </span>
          ) : (
            <Button
              key={n}
              variant={n === paging.page ? "outline" : "ghost"}
              size="sm"
              className="min-w-8 tabular-nums"
              aria-current={n === paging.page ? "page" : undefined}
              nativeButton={false}
              render={<Link href={href(n)} />}
            >
              {n}
            </Button>
          ),
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={paging.page >= last}
          nativeButton={false}
          render={paging.page < last ? <Link href={href(paging.page + 1)} /> : <span />}
        >
          <ChevronRight />
        </Button>
      </nav>
      <label className="flex items-center gap-2">
        Per page
        <NativeSelect
          aria-label="Entries per page"
          value={paging.size}
          onChange={(e) =>
            router.push(activityHref(filters, { page: 1, size: Number(e.target.value) }))
          }
        >
          {ACTIVITY_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
      </label>
    </div>
  );
}

export function DecisionTable({
  filters,
  paging,
  agents,
}: {
  filters: ActivityFilters;
  paging: Paging;
  agents: AgentSummary[];
}) {
  const query = { ...toAuditQuery(filters), page: paging.page, limit: paging.size };
  const first = useApi(apiUrl(API_ENDPOINTS.AUDIT, { query }), AuditPage);

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
  const rows = first.data.entries;
  const total = first.data.total ?? rows.length;

  if (rows.length === 0 && total > 0) {
    const last = pageCount(total, paging.size);
    return (
      <PanelBody className="p-0">
        <EmptyState
          icon={ListFilter}
          title={`There is no page ${paging.page}`}
          description={`These filters have ${last} ${last === 1 ? "page" : "pages"}.`}
        />
        <div className="flex justify-center pb-6">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={activityHref(filters, { ...paging, page: last })} />}
          >
            Go to page {last}
          </Button>
        </div>
      </PanelBody>
    );
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
      <Table
        aria-busy={first.stale || undefined}
        className={cn("transition-opacity", first.stale && "opacity-50")}
      >
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
              <TableCell label="User">
                {r.user ? (
                  <span className="inline-flex items-center gap-1.5">
                    {r.user}
                    <MemberLabel email={r.user} />
                  </span>
                ) : (
                  <Dash />
                )}
              </TableCell>
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
      <Pager filters={filters} paging={paging} total={total} />
    </PanelBody>
  );
}
