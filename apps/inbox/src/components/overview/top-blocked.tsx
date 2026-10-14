import { Card, CardContent, CardHeader, CardTitle } from "@intentlock/ui/components/card";
import Link from "next/link";

import { ActivityParam } from "@/lib/enums/activity-param.enum";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import type { Overview } from "@/lib/schemas";

function TopList({
  title,
  rows,
  filter,
}: {
  title: string;
  rows: { key: string; count: number }[];
  filter: ActivityParam;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing blocked.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {rows.map((r) => (
              <li key={r.key} className="flex justify-between gap-4">
                <Link
                  href={`/activity?${new URLSearchParams({ [filter]: r.key, [ActivityParam.VERDICT]: AuditVerdict.BLOCK })}`}
                  className="truncate font-mono text-xs underline-offset-4 hover:underline"
                >
                  {r.key}
                </Link>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function TopBlocked({ overview: o }: { overview: Overview }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TopList
        title="Top blocked tools"
        filter={ActivityParam.TOOL}
        rows={o.topBlockedTools.map((t) => ({ key: t.tool, count: t.count }))}
      />
      <TopList
        title="Top blocking rules"
        filter={ActivityParam.RULE_ID}
        rows={o.topBlockedRules.map((r) => ({ key: r.ruleId, count: r.count }))}
      />
    </div>
  );
}
