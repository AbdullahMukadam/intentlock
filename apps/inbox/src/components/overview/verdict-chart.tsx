"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@intentlock/ui/components/chart";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { ChartColumn } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/empty-state";
import { StatsBucket } from "@/lib/enums/stats-bucket.enum";
import { fillSeries } from "@/lib/fill-series";
import type { Overview } from "@/lib/schemas";

import { changeLabel } from "./kpi-panel";

type Row = { label: string; total: number; allow: number; block: number; hold: number };

function bucketLabel(bucket: string, size: string) {
  const d = new Date(bucket);
  return size === StatsBucket.HOUR
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

const CONFIG = {
  allow: { label: "Allowed", color: "var(--success)" },
  block: { label: "Blocked", color: "var(--destructive)" },
  hold: { label: "Held", color: "var(--warning)" },
} satisfies ChartConfig;

const STACK = ["allow", "hold", "block"] as const;

export function VerdictChart({
  overview,
  previousTotal,
  periodLabel,
}: {
  overview: Overview;
  previousTotal: number | undefined;
  periodLabel: string;
}) {
  const t = overview.totals;
  const total = t.allow + t.block + t.hold;
  const change = changeLabel(total, previousTotal);
  const data: Row[] = fillSeries(overview).map((s) => ({
    label: bucketLabel(s.bucket, overview.bucket),
    total: s.allow + s.block + s.hold,
    allow: s.allow,
    block: s.block,
    hold: s.hold,
  }));

  return (
    <Panel className="h-full">
      <PanelHeader>
        <PanelTitle>
          <ChartColumn />
          Decision volume
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="flex flex-col gap-4">
        <div className="flex items-baseline gap-3">
          <span className="text-[30px] leading-none font-semibold tracking-tight tabular-nums">
            {total.toLocaleString()}
          </span>
          {change && (
            <span className="text-xs text-muted-foreground">
              <span
                className={cn(
                  "mr-1 font-medium",
                  change.sign > 0 && "text-success",
                  change.sign < 0 && "text-destructive",
                )}
              >
                {change.text}
              </span>
              {periodLabel}
            </span>
          )}
        </div>
        {total === 0 ? (
          <EmptyState
            icon={ChartColumn}
            title="No decisions in this range"
            description="Once an agent signs a plan and calls a tool, its decisions are charted here."
            className="min-h-60"
          />
        ) : (
          <ChartContainer config={CONFIG} className="h-72 w-full">
            <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis
                orientation="right"
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <ChartTooltip
                cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                content={({ active, payload, label }) => (
                  <ChartTooltipContent
                    active={active}
                    payload={payload}
                    label={`${String(label)} · ${(payload?.[0]?.payload as Row | undefined)?.total.toLocaleString() ?? 0}`}
                  />
                )}
              />
              <ChartLegend content={({ payload }) => <ChartLegendContent payload={payload} />} />
              {STACK.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="verdicts"
                  fill={`var(--color-${key})`}
                  maxBarSize={44}
                  radius={i === STACK.length - 1 ? [4, 4, 0, 0] : 0}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
      </PanelBody>
    </Panel>
  );
}
