"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Card, CardContent, CardHeader, CardTitle } from "@intentlock/ui/components/card";
import { Flag } from "lucide-react";

import Loader from "@/components/loader";
import { VerdictBadge } from "@/components/verdict-badge";
import { ApiError, apiUrl } from "@/lib/api";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { formatDuration, formatTime } from "@/lib/format";
import { type HoldView, RunDetail } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const STEP_HEADERS = ["Tool", "Arguments", "Max calls", "Required"];
const CALL_HEADERS = [
  "#",
  "Offset",
  "Tool",
  "Arguments",
  "Verdict",
  "Rule",
  "Reason",
  "Approval",
  "Outcome",
];

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return <code className="block max-w-md truncate font-mono text-xs">{JSON.stringify(value)}</code>;
}

function Approval({ hold }: { hold: HoldView | undefined }) {
  if (!hold) return <span className="text-muted-foreground">—</span>;
  const waited = hold.resolvedAt
    ? (new Date(hold.resolvedAt).getTime() - new Date(hold.createdAt).getTime()) / 1000
    : null;
  return (
    <div className="grid gap-0.5">
      <VerdictBadge verdict={hold.status} />
      {hold.resolvedBy && (
        <span className="text-muted-foreground">
          by {hold.resolvedBy} after {formatDuration(waited)}
        </span>
      )}
      {hold.note && <span className="italic">“{hold.note}”</span>}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function RunTimeline({ planId }: { planId: string }) {
  const { data, error } = useApi(apiUrl(API_ENDPOINTS.RUN, { params: { planId } }), RunDetail);

  if (error instanceof ApiError && error.status === HttpStatus.NOT_FOUND) {
    return <p className="text-sm text-muted-foreground">Run not found, or not one you can see.</p>;
  }
  if (error) return <p className="text-sm text-destructive">Could not load this run.</p>;
  if (!data) return <Loader />;

  const { plan, agent, decisions, holds, reports, timing } = data;
  const holdById = new Map(holds.map((h) => [h.id, h]));
  const outcomeByCall = new Map(reports.map((r) => [r.callId, r.outcome]));
  const start = timing.firstDecisionAt ? new Date(timing.firstDecisionAt).getTime() : 0;

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-xs text-muted-foreground">Run {plan.id}</p>
        <h1 className="text-2xl font-semibold">{plan.goal || "Untitled run"}</h1>
      </div>
      <Card size="sm">
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Meta label="Agent">{agent?.name ?? "—"}</Meta>
            <Meta label="User">{plan.user}</Meta>
            <Meta label="Status">{plan.status}</Meta>
            <Meta label="Policy version">v{plan.policyVersion}</Meta>
            <Meta label="Signed">{formatTime(plan.createdAt)}</Meta>
            <Meta label="Expires">{formatTime(plan.expiresAt)}</Meta>
            <Meta label="Duration">
              {formatDuration(timing.durationMs == null ? null : timing.durationMs / 1000)}
            </Meta>
            <Meta label="Plan hash">
              <code className="font-mono text-xs" title={plan.planHash}>
                {plan.planHash.slice(0, 16)}…
              </code>
            </Meta>
          </dl>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <Table headers={STEP_HEADERS}>
            {plan.steps.map((s, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1.5 font-mono">{s.tool}</td>
                <td className="px-2 py-1.5">
                  <Json value={s.args} />
                </td>
                <td className="px-2 py-1.5 tabular-nums">{s.maxCalls}</td>
                <td className="px-2 py-1.5">{s.required ? "yes" : "no"}</td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Tool calls</CardTitle>
        </CardHeader>
        <CardContent>
          <Table headers={CALL_HEADERS}>
            {decisions.length === 0 && (
              <tr>
                <td
                  colSpan={CALL_HEADERS.length}
                  className="px-2 py-6 text-center text-muted-foreground"
                >
                  No tool calls yet.
                </td>
              </tr>
            )}
            {decisions.map((d) => (
              <tr key={d.seq} className="border-t align-top">
                <td className="px-2 py-1.5 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    {d.seq}
                    {d.flagged && (
                      <Flag
                        aria-label={`Flagged: ${d.flagged}`}
                        className="size-3 text-destructive"
                      />
                    )}
                  </span>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap tabular-nums" title={formatTime(d.at)}>
                  +{formatDuration((new Date(d.at).getTime() - start) / 1000)}
                </td>
                <td className="px-2 py-1.5 font-mono">{d.tool ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <Json value={d.args} />
                </td>
                <td className="px-2 py-1.5">
                  <VerdictBadge verdict={d.verdict} />
                </td>
                <td className="px-2 py-1.5 font-mono">{d.ruleId ?? "—"}</td>
                <td className="px-2 py-1.5">{d.reason ?? "—"}</td>
                <td className="px-2 py-1.5">
                  <Approval hold={d.holdId ? holdById.get(d.holdId) : undefined} />
                </td>
                <td className="px-2 py-1.5">{(d.callId && outcomeByCall.get(d.callId)) ?? "—"}</td>
              </tr>
            ))}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
