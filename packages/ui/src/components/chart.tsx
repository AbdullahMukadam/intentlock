"use client";

import { cn } from "@intentlock/ui/lib/utils";
import * as React from "react";
import * as RechartsPrimitive from "recharts";
import type { LegendPayload, TooltipPayloadEntry } from "recharts";

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

function ChartContainer({
  config,
  className,
  children,
  style,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}) {
  const colors = Object.fromEntries(
    Object.entries(config)
      .filter(([, item]) => item.color)
      .map(([key, item]) => [`--color-${key}`, item.color]),
  );
  return (
    <ChartContext value={{ config }}>
      <div
        data-slot="chart"
        className={cn(
          "flex justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-surface]:outline-hidden",
          className,
        )}
        style={{ ...colors, ...style }}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

function ChartTooltipContent({
  active,
  payload,
  label,
  hideLabel = false,
  footer,
  className,
}: {
  active?: boolean;
  payload?: readonly TooltipPayloadEntry[];
  label?: React.ReactNode;
  hideLabel?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { config } = useChart();
  if (!active || !payload?.length) return null;
  return (
    <div
      className={cn(
        "grid min-w-32 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl",
        className,
      )}
    >
      {!hideLabel && label !== undefined && <div className="font-medium">{label}</div>}
      <div className="grid gap-1">
        {payload.map((item) => {
          const key = String(item.dataKey ?? item.name ?? "");
          const entry = config[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ background: entry?.color ?? item.color }}
              />
              <span className="text-muted-foreground">{entry?.label ?? item.name}</span>
              <span className="ml-auto pl-3 font-mono font-medium tabular-nums">
                {typeof item.value === "number" ? item.value.toLocaleString() : String(item.value)}
              </span>
            </div>
          );
        })}
      </div>
      {footer}
    </div>
  );
}

const ChartLegend = RechartsPrimitive.Legend;

function ChartLegendContent({
  payload,
  className,
}: {
  payload?: readonly LegendPayload[];
  className?: string;
}) {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn("flex items-center justify-center gap-4 pt-3", className)}>
      {payload.map((item) => {
        const key = String(item.dataKey ?? item.value ?? "");
        const entry = config[key];
        return (
          <div key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-[2px]"
              style={{ background: entry?.color ?? item.color }}
            />
            <span className="text-muted-foreground">{entry?.label ?? item.value}</span>
          </div>
        );
      })}
    </div>
  );
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent };
