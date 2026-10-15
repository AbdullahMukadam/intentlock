"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import { Flag, Info, ListTree, SearchX, TriangleAlert, Wrench } from "lucide-react";
import Link from "next/link";

import { DetailGrid, DetailItem } from "@/components/detail-grid";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { VerdictBadge } from "@/components/verdict-badge";
import { ApiError, apiUrl } from "@/lib/api";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { formatDuration, formatTime } from "@/lib/format";
import { type HoldView, RunDetail } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const STEP_HEADERS = ["#", "Tool", "Pinned arguments", "Max calls", "Required"];
const CALL_HEADERS = [
  "#",
  "Time",
  "Tool",
  "Arguments",
  "Verdict",
  "Rule / reason",
  "Approval",
  "Outcome",
];

function Dash() {
  return (
    <span data-empty className="text-muted-foreground/60">
      —
    </span>
  );
}

function Json({ value }: { value: unknown }) {
  if (value == null || (typeof value === "object" && Object.keys(value).length === 0))
    return <Dash />;
  const text = JSON.stringify(value);
  return (
    <code className="block max-w-xs truncate font-mono text-xs text-muted-foreground" title={text}>
      {text}
    </code>
  );
}

function Approval({ hold }: { hold: HoldView | undefined }) {
  if (!hold) return <Dash />;
  const waited = hold.resolvedAt
    ? (new Date(hold.resolvedAt).getTime() - new Date(hold.createdAt).getTime()) / 1000
    : null;
  return (
    <div className="grid gap-1 whitespace-normal">
      <VerdictBadge verdict={hold.status} />
      {hold.resolvedBy && (
        <span className="text-xs text-muted-foreground">
          by {hold.resolvedBy} after {formatDuration(waited)}
        </span>
      )}
      {hold.note && <span className="text-xs italic">“{hold.note}”</span>}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Panel>
      <PanelBody className="p-0">{children}</PanelBody>
    </Panel>
  );
}

export function RunTimeline({ planId }: { planId: string }) {
  const { data, error } = useApi(apiUrl(API_ENDPOINTS.RUN, { params: { planId } }), RunDetail);

  if (error instanceof ApiError && error.status === HttpStatus.NOT_FOUND) {
    return (
      <Shell>
        <EmptyState
          icon={SearchX}
          title="Run not found"
          description="It does not exist, or it belongs to someone else's runs that you can't see."
          action={
            <Link
              href="/activity"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Back to activity
            </Link>
          }
        />
      </Shell>
    );
  }
  if (error) {
    return (
      <Shell>
        <EmptyState icon={TriangleAlert} title="Could not load this run" />
      </Shell>
    );
  }
  if (!data) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-28" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { plan, agent, decisions, holds, reports, timing } = data;
  const holdById = new Map(holds.map((h) => [h.id, h]));
  const outcomeByCall = new Map(reports.map((r) => [r.callId, r.outcome]));
  const start = timing.firstDecisionAt ? new Date(timing.firstDecisionAt).getTime() : 0;

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow={
          <>
            <Link href="/activity" className="hover:text-foreground">
              Activity
            </Link>{" "}
            / <span className="font-mono">{plan.id}</span>
          </>
        }
        title={plan.goal || "Untitled run"}
        description={`${agent?.name ?? "Unknown agent"} acting for ${plan.user}`}
        actions={<Badge className="capitalize">{plan.status.toLowerCase()}</Badge>}
      />
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <Info />
            Summary
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="p-0">
          <DetailGrid className="-mb-px">
            <DetailItem label="Agent">{agent?.name ?? "—"}</DetailItem>
            <DetailItem label="User">{plan.user}</DetailItem>
            <DetailItem label="Policy version">v{plan.policyVersion}</DetailItem>
            <DetailItem label="Duration">
              {formatDuration(timing.durationMs == null ? null : timing.durationMs / 1000)}
            </DetailItem>
            <DetailItem label="Signed">{formatTime(plan.createdAt)}</DetailItem>
            <DetailItem label="Expires">{formatTime(plan.expiresAt)}</DetailItem>
            <DetailItem label="Decisions">{decisions.length}</DetailItem>
            <DetailItem label="Plan hash">
              <code className="font-mono text-xs" title={plan.planHash}>
                {plan.planHash.slice(0, 16)}…
              </code>
            </DetailItem>
          </DetailGrid>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <ListTree />
            Signed plan
            <PanelCount>{plan.steps.length}</PanelCount>
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {STEP_HEADERS.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.steps.map((s, i) => (
                <TableRow key={i}>
                  <TableCell label="#" className="w-10 text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell label="Tool" className="font-mono text-xs font-medium">
                    {s.tool}
                  </TableCell>
                  <TableCell label="Pinned arguments">
                    <Json value={s.args} />
                  </TableCell>
                  <TableCell label="Max calls" className="tabular-nums">
                    {s.maxCalls}
                  </TableCell>
                  <TableCell label="Required">
                    {s.required ? <Badge tone="info">required</Badge> : <Dash />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <Wrench />
            Tool calls
            <PanelCount>{decisions.length}</PanelCount>
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="overflow-hidden p-0">
          {decisions.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No tool calls yet"
              description="Each call the agent makes under this plan is listed here with its verdict."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {CALL_HEADERS.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.map((d) => (
                  <TableRow key={d.seq} className="align-top">
                    <TableCell
                      label="#"
                      className="font-mono text-xs text-muted-foreground tabular-nums"
                    >
                      <span className="inline-flex items-center gap-1">
                        {d.seq}
                        {d.flagged && (
                          <Flag
                            aria-label={`Flagged: ${d.flagged}`}
                            className="size-3 text-destructive"
                          />
                        )}
                      </span>
                    </TableCell>
                    <TableCell
                      label="Time"
                      className="text-muted-foreground tabular-nums"
                      title={formatTime(d.at)}
                    >
                      +{formatDuration((new Date(d.at).getTime() - start) / 1000)}
                    </TableCell>
                    <TableCell label="Tool" className="font-mono text-xs font-medium">
                      {d.tool ?? <Dash />}
                    </TableCell>
                    <TableCell label="Arguments">
                      <Json value={d.args} />
                    </TableCell>
                    <TableCell label="Verdict">
                      <VerdictBadge verdict={d.verdict} />
                    </TableCell>
                    <TableCell label="Rule / reason">
                      {d.ruleId ? (
                        <span className="font-mono text-xs">{d.ruleId}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{d.reason ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell label="Approval">
                      <Approval hold={d.holdId ? holdById.get(d.holdId) : undefined} />
                    </TableCell>
                    <TableCell label="Outcome" className="text-xs">
                      {(d.callId && outcomeByCall.get(d.callId)) ?? <Dash />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
