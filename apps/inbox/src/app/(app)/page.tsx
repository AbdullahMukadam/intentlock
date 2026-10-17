"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Panel, PanelBody } from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import { buttonVariants } from "@intentlock/ui/components/button";
import { ArrowRight, Hand, Rocket, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AgentFilter, useAgentList } from "@/components/agent-filter";
import { useMe } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/native-select";
import { KpiPanel } from "@/components/overview/kpi-panel";
import { LatestActivity } from "@/components/overview/latest-activity";
import { StatTiles } from "@/components/overview/stat-tiles";
import { TopBlocked } from "@/components/overview/top-blocked";
import { VerdictChart } from "@/components/overview/verdict-chart";
import { PageHeader } from "@/components/page-header";
import { apiUrl } from "@/lib/api";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { TimeRange } from "@/lib/enums/time-range.enum";
import { fillSeries } from "@/lib/fill-series";
import { firstName } from "@/lib/format";
import { can } from "@/lib/permissions";
import { Overview } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HOUR_MS = 60 * 60 * 1000;
const RANGES: Record<TimeRange, { ms: number; label: string; compare: string }> = {
  [TimeRange.DAY]: { ms: 24 * HOUR_MS, label: "Last 24 hours", compare: "vs previous 24 h" },
  [TimeRange.WEEK]: { ms: 7 * 24 * HOUR_MS, label: "Last 7 days", compare: "vs previous 7 days" },
  [TimeRange.MONTH]: {
    ms: 30 * 24 * HOUR_MS,
    label: "Last 30 days",
    compare: "vs previous 30 days",
  },
};

function window(range: TimeRange) {
  const now = Date.now();
  const ms = RANGES[range].ms;
  return {
    from: new Date(now - ms).toISOString(),
    prevFrom: new Date(now - 2 * ms).toISOString(),
  };
}

const KPIS = [
  { verdict: AuditVerdict.ALLOW, title: "Allowed", icon: ShieldCheck, color: "var(--success)" },
  { verdict: AuditVerdict.BLOCK, title: "Blocked", icon: ShieldX, color: "var(--destructive)" },
  { verdict: AuditVerdict.HOLD, title: "Held for approval", icon: Hand, color: "var(--warning)" },
] as const;

function LoadingGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {KPIS.map((k) => (
        <Panel key={k.verdict}>
          <PanelBody className="grid gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </PanelBody>
        </Panel>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const me = useMe();
  const { agents: agentList, failed: agentsFailed } = useAgentList();
  const agents = agentList ?? [];
  const [agentId, setAgentId] = useState("");
  const [range, setRange] = useState(TimeRange.DAY);
  const [span, setSpan] = useState(() => window(TimeRange.DAY));
  const { data, error } = useApi(
    apiUrl(API_ENDPOINTS.STATS_OVERVIEW, { query: { from: span.from, agentId } }),
    Overview,
  );
  const previous = useApi(
    apiUrl(API_ENDPOINTS.STATS_OVERVIEW, {
      query: { from: span.prevFrom, to: span.from, agentId },
    }),
    Overview,
  ).data;
  const compare = RANGES[range].compare;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={`Hello, ${firstName(me.email)}`}
        description="Here's what your agents tried to do, and what Intentlock let through."
        actions={
          <>
            <NativeSelect
              aria-label="Time range"
              value={range}
              onChange={(e) => {
                const next = e.target.value as TimeRange;
                setRange(next);
                setSpan(window(next));
              }}
            >
              {Object.values(TimeRange).map((r) => (
                <option key={r} value={r}>
                  {RANGES[r].label}
                </option>
              ))}
            </NativeSelect>
            <AgentFilter
              agents={agents}
              failed={agentsFailed}
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </>
        }
      />
      {agentList?.length === 0 && can(me.role, UiAction.CREATE_AGENT) && (
        <div className="flex flex-col gap-4 rounded-xl border bg-panel bg-hatch p-1 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-4 rounded-lg border bg-card p-4 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Rocket className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Connect your first agent</p>
              <p className="text-[13px] text-muted-foreground">
                Register an agent, create its API key and watch its first checked call arrive. About
                two minutes.
              </p>
            </div>
            <Link href="/welcome" className={buttonVariants()}>
              Get started <ArrowRight />
            </Link>
          </div>
        </div>
      )}
      {error ? (
        <Panel>
          <PanelBody className="p-0">
            <EmptyState
              icon={TriangleAlert}
              title="Could not load the overview"
              description="The server did not answer. Reload the page to try again."
            />
          </PanelBody>
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_22rem]">
            <div className="xl:col-span-3">
              {!data ? (
                <LoadingGrid />
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  {KPIS.map((k) => (
                    <KpiPanel
                      key={k.verdict}
                      title={k.title}
                      icon={k.icon}
                      value={data.totals[k.verdict]}
                      previous={previous?.totals[k.verdict]}
                      series={fillSeries(data).map((s) => s[k.verdict])}
                      color={k.color}
                      periodLabel={compare}
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="xl:col-start-4 xl:row-span-2 xl:row-start-1">
              <LatestActivity agentId={agentId} agents={agents} />
            </div>
            <div className="xl:col-span-3">
              {data ? (
                <VerdictChart
                  overview={data}
                  previousTotal={
                    previous
                      ? previous.totals.allow + previous.totals.block + previous.totals.hold
                      : undefined
                  }
                  periodLabel={compare}
                />
              ) : (
                <Panel>
                  <PanelBody>
                    <Skeleton className="h-72" />
                  </PanelBody>
                </Panel>
              )}
            </div>
          </div>
          {data && <StatTiles overview={data} />}
          {data && <TopBlocked overview={data} />}
        </>
      )}
    </div>
  );
}
