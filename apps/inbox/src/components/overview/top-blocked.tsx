import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import { ScrollText, ShieldCheck, Wrench } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { ActivityParam } from "@/lib/enums/activity-param.enum";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import type { Overview } from "@/lib/schemas";

function TopList({
  title,
  column,
  icon: Icon,
  rows,
  filter,
}: {
  title: string;
  column: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: { key: string; count: number }[];
  filter: ActivityParam;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Icon />
          {title}
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="overflow-hidden p-0">
        {rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing blocked"
            description="No calls were blocked in this range."
            className="py-8"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{column}</TableHead>
                <TableHead className="w-40">Blocked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="max-w-0 truncate">
                    <Link
                      href={`/activity?${new URLSearchParams({ [filter]: r.key, [ActivityParam.VERDICT]: AuditVerdict.BLOCK })}`}
                      className="font-mono text-xs font-medium underline-offset-4 hover:underline"
                    >
                      {r.key}
                    </Link>
                  </TableCell>
                  <TableCell label="Blocked">
                    <span className="flex items-center gap-2 max-sm:w-44">
                      <span className="w-8 text-right tabular-nums">{r.count}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-destructive"
                          style={{ width: `${(r.count / max) * 100}%` }}
                        />
                      </span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PanelBody>
    </Panel>
  );
}

export function TopBlocked({ overview: o }: { overview: Overview }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TopList
        title="Top blocked tools"
        column="Tool"
        icon={Wrench}
        filter={ActivityParam.TOOL}
        rows={o.topBlockedTools.map((t) => ({ key: t.tool, count: t.count }))}
      />
      <TopList
        title="Top blocking rules"
        column="Rule"
        icon={ScrollText}
        filter={ActivityParam.RULE_ID}
        rows={o.topBlockedRules.map((r) => ({ key: r.ruleId, count: r.count }))}
      />
    </div>
  );
}
