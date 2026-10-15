"use client";

import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { ChartColumn } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground shadow-lg">
      <div className="font-medium">
        {row.label} · {row.total.toLocaleString()}
      </div>
      <div className="mt-1 flex gap-3 opacity-80">
        <span>{row.allow} allowed</span>
        <span>{row.block} blocked</span>
        <span>{row.hold} held</span>
      </div>
    </div>
  );
}

export function VerdictChart({
  overview,
  previousTotal,
  periodLabel,
}: {
  overview: Overview;
  previousTotal: number | undefined;
  periodLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
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
  const peak = data.reduce((best, row, i) => (row.total > (data[best]?.total ?? -1) ? i : best), 0);
  const highlighted = active ?? peak;

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
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 0, bottom: 0, left: -12 }}
                onMouseMove={(state) =>
                  setActive(typeof state.activeIndex === "number" ? state.activeIndex : null)
                }
                onMouseLeave={() => setActive(null)}
              >
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={16}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  orientation="right"
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip cursor={false} content={<ChartTooltip />} />
                <Bar dataKey="total" radius={[6, 6, 6, 6]} maxBarSize={44}>
                  {data.map((row, i) => (
                    <Cell
                      key={row.label + i}
                      fill={i === highlighted ? "var(--chart-1)" : "var(--chart-2)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
