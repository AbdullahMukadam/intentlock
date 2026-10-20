"use client";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@intentlock/ui/components/chart";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Hand } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { EmptyState } from "@/components/empty-state";
import type { Overview } from "@/lib/schemas";

const CONFIG = {
  approved: { label: "Approved", color: "var(--success)" },
  rejected: { label: "Rejected", color: "var(--destructive)" },
  expired: { label: "Expired", color: "var(--muted-foreground)" },
} satisfies ChartConfig;

const KEYS = ["approved", "rejected", "expired"] as const;

export function HoldOutcomes({ overview }: { overview: Overview }) {
  const outcomes = overview.holdOutcomes;
  const total = outcomes.approved + outcomes.rejected + outcomes.expired;
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Hand />
          Hold outcomes
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="grid gap-3">
        {total === 0 ? (
          <EmptyState
            icon={Hand}
            title="No holds resolved in this range"
            description="Approved, rejected and expired holds are counted here."
            className="py-6"
          />
        ) : (
          <>
            <ChartContainer config={CONFIG} className="h-10 w-full">
              <BarChart
                data={[outcomes]}
                layout="vertical"
                margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              >
                <XAxis type="number" hide domain={[0, total]} />
                <YAxis type="category" hide />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload }) => (
                    <ChartTooltipContent active={active} payload={payload} hideLabel />
                  )}
                />
                {KEYS.map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="outcomes"
                    fill={`var(--color-${key})`}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              {KEYS.map((key) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ background: CONFIG[key].color }}
                  />
                  <dt className="text-muted-foreground">{CONFIG[key].label}</dt>
                  <dd className="ml-auto font-medium tabular-nums">
                    {outcomes[key].toLocaleString()}
                    <span className="ml-1 text-muted-foreground">
                      {Math.round((outcomes[key] / total) * 100)}%
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
