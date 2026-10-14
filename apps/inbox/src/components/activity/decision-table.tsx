"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Flag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import Loader from "@/components/loader";
import { VerdictBadge } from "@/components/verdict-badge";
import { type ActivityFilters, toAuditQuery } from "@/lib/activity-filters";
import { apiUrl, request } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { type AgentSummary, AuditPage, type AuditRow } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HEADERS = ["#", "Time", "Kind", "Agent", "User", "Tool", "Verdict", "Rule", "Policy", "Run"];

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-2 py-1.5 whitespace-nowrap">
      {children || <span className="text-muted-foreground">—</span>}
    </td>
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

  if (first.error) return <p className="text-sm text-destructive">Could not load activity.</p>;
  if (!first.data) return <Loader />;

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
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              {HEADERS.map((h) => (
                <th key={h} className="px-2 py-1.5 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={HEADERS.length}
                  className="px-2 py-6 text-center text-muted-foreground"
                >
                  No matching entries.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.seq} className="border-t">
                <Cell>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    {r.seq}
                    {r.flagged && (
                      <Flag
                        aria-label={`Flagged: ${r.flagged}`}
                        className="size-3 text-destructive"
                      />
                    )}
                  </span>
                </Cell>
                <Cell>{formatTime(r.at)}</Cell>
                <Cell>{r.kind}</Cell>
                <Cell>{r.agentId && (names.get(r.agentId) ?? r.agentId)}</Cell>
                <Cell>{r.user}</Cell>
                <Cell>{r.tool && <span className="font-mono">{r.tool}</span>}</Cell>
                <Cell>{r.verdict && <VerdictBadge verdict={r.verdict} />}</Cell>
                <Cell>{r.ruleId && <span className="font-mono">{r.ruleId}</span>}</Cell>
                <Cell>{r.policyVersion && `v${r.policyVersion}`}</Cell>
                <Cell>
                  {r.planId && (
                    <Link
                      href={`/runs/${r.planId}`}
                      className="font-mono underline-offset-4 hover:underline"
                    >
                      {r.planId.slice(0, 8)}
                    </Link>
                  )}
                </Cell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {next != null && (
        <Button
          variant="outline"
          onClick={loadMore}
          disabled={loadingMore}
          className="justify-self-center"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
