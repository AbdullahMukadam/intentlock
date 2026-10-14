"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import { StatsBucket } from "@/lib/enums/stats-bucket.enum";
import type { Overview } from "@/lib/schemas";
import { VERDICT_COLORS } from "@/lib/verdict-colors";

const STACK = [AuditVerdict.ALLOW, AuditVerdict.HOLD, AuditVerdict.BLOCK] as const;

function bucketLabel(bucket: string, size: string) {
  const d = new Date(bucket);
  return size === StatsBucket.HOUR
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function VerdictChart({ overview }: { overview: Overview }) {
  if (overview.series.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No decisions in this range.
      </p>
    );
  }
  const data = overview.series.map((s) => ({
    ...s,
    label: bucketLabel(s.bucket, overview.bucket),
  }));
  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          contentStyle={{
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {STACK.map((verdict, i) => (
          <Bar
            key={verdict}
            dataKey={(row: Overview["totals"]) => row[verdict]}
            name={verdict}
            stackId="verdicts"
            fill={VERDICT_COLORS[verdict]}
            stroke="var(--background)"
            strokeWidth={2}
            radius={i === STACK.length - 1 ? [4, 4, 0, 0] : 0}
            maxBarSize={32}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
