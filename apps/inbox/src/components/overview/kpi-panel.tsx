"use client";

import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { useId } from "react";
import { ChartContainer } from "@intentlock/ui/components/chart";
import { Area, AreaChart } from "recharts";

export function changeLabel(current: number, previous: number | undefined) {
  if (previous === undefined) return null;
  if (previous === 0) return current === 0 ? { text: "0%", sign: 0 } : { text: "new", sign: 1 };
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(pct) < 10 ? pct.toFixed(1) : Math.round(pct).toString();
  return { text: `${pct > 0 ? "+" : ""}${rounded}%`, sign: Math.sign(pct) };
}

export function KpiPanel({
  title,
  icon: Icon,
  value,
  previous,
  series,
  color,
  periodLabel,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  previous: number | undefined;
  series: number[];
  color: string;
  periodLabel: string;
}) {
  const gradient = useId();
  const change = changeLabel(value, previous);
  const data = series.length > 1 ? series.map((v) => ({ v })) : [{ v: 0 }, { v: value }];
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>{title}</PanelTitle>
        <Icon className="size-4 text-muted-foreground" />
      </PanelHeader>
      <PanelBody className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5">
        <div className="text-[28px] leading-none font-semibold tracking-tight tabular-nums">
          {value.toLocaleString()}
        </div>
        <div className="row-span-1 h-11 w-24" aria-hidden>
          <ChartContainer config={{ v: { color } }} className="h-full w-full">
            <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="linear"
                dataKey="v"
                stroke="var(--color-v)"
                strokeWidth={1.5}
                fill={`url(#${gradient})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        </div>
        <div className="col-span-2 truncate text-xs text-muted-foreground">
          {change && (
            <span
              className={cn(
                "mr-1 font-medium",
                change.sign > 0 && "text-success",
                change.sign < 0 && "text-destructive",
              )}
            >
              {change.text}
            </span>
          )}
          {periodLabel}
        </div>
      </PanelBody>
    </Panel>
  );
}
