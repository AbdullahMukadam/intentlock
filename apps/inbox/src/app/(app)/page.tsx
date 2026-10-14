"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Card, CardContent, CardHeader, CardTitle } from "@intentlock/ui/components/card";
import { useState } from "react";

import Loader from "@/components/loader";
import { AgentFilter, useAgents } from "@/components/agent-filter";
import { NativeSelect } from "@/components/native-select";
import { StatTiles } from "@/components/overview/stat-tiles";
import { TopBlocked } from "@/components/overview/top-blocked";
import { VerdictChart } from "@/components/overview/verdict-chart";
import { apiUrl } from "@/lib/api";
import { TimeRange } from "@/lib/enums/time-range.enum";
import { Overview } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HOUR_MS = 60 * 60 * 1000;
const RANGE_MS: Record<TimeRange, number> = {
  [TimeRange.DAY]: 24 * HOUR_MS,
  [TimeRange.WEEK]: 7 * 24 * HOUR_MS,
  [TimeRange.MONTH]: 30 * 24 * HOUR_MS,
};

const since = (range: TimeRange) => new Date(Date.now() - RANGE_MS[range]).toISOString();

export default function OverviewPage() {
  const agents = useAgents();
  const [agentId, setAgentId] = useState("");
  const [range, setRange] = useState(TimeRange.DAY);
  const [from, setFrom] = useState(() => since(TimeRange.DAY));
  const { data, error } = useApi(
    apiUrl(API_ENDPOINTS.STATS_OVERVIEW, { query: { from, agentId } }),
    Overview,
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <div className="flex gap-2">
          <NativeSelect
            aria-label="Time range"
            value={range}
            onChange={(e) => {
              const next = e.target.value as TimeRange;
              setRange(next);
              setFrom(since(next));
            }}
          >
            <option value={TimeRange.DAY}>Last 24 hours</option>
            <option value={TimeRange.WEEK}>Last 7 days</option>
            <option value={TimeRange.MONTH}>Last 30 days</option>
          </NativeSelect>
          <AgentFilter
            agents={agents}
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
          />
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive">Could not load the overview.</p>
      ) : !data ? (
        <Loader />
      ) : (
        <>
          <StatTiles overview={data} />
          <Card>
            <CardHeader>
              <CardTitle>Decisions over time</CardTitle>
            </CardHeader>
            <CardContent>
              <VerdictChart overview={data} />
            </CardContent>
          </Card>
          <TopBlocked overview={data} />
        </>
      )}
    </div>
  );
}
