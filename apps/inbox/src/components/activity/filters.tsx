"use client";

import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { AgentFilter } from "@/components/agent-filter";
import { NativeSelect } from "@/components/native-select";
import type { ActivityFilters } from "@/lib/activity-filters";
import { ActivityParam } from "@/lib/enums/activity-param.enum";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import type { AgentSummary } from "@/lib/schemas";

const MORE: ActivityParam[] = [
  ActivityParam.USER,
  ActivityParam.TOOL,
  ActivityParam.RULE_ID,
  ActivityParam.POLICY_VERSION,
  ActivityParam.FROM,
  ActivityParam.TO,
];

export function Filters({
  values: v,
  agents,
  agentsFailed = false,
}: {
  values: ActivityFilters;
  agents: AgentSummary[];
  agentsFailed?: boolean;
}) {
  const moreActive = MORE.some((p) => Boolean(v[p as keyof ActivityFilters]));
  return (
    <Form action="/activity" className="grid gap-2 px-2 pb-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name={ActivityParam.Q}
            defaultValue={v.q}
            placeholder="Search kind, tool, rule, user"
            aria-label="Search"
            className="pl-9"
          />
        </div>
        <AgentFilter
          agents={agents}
          failed={agentsFailed}
          name={ActivityParam.AGENT_ID}
          defaultValue={v.agentId}
        />
        <NativeSelect aria-label="Verdict" name={ActivityParam.VERDICT} defaultValue={v.verdict}>
          <option value="">Any verdict</option>
          {Object.values(AuditVerdict).map((verdict) => (
            <option key={verdict} value={verdict}>
              {verdict}
            </option>
          ))}
        </NativeSelect>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" nativeButton={false} render={<Link href="/activity" />}>
            Reset
          </Button>
          <Button type="submit">Apply</Button>
        </div>
      </div>
      <details open={moreActive} className="group">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 text-xs font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-3.5" />
          More filters
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            name={ActivityParam.USER}
            defaultValue={v.user}
            placeholder="User email"
            aria-label="User"
            className="w-52"
          />
          <Input
            name={ActivityParam.TOOL}
            defaultValue={v.tool}
            placeholder="Tool"
            aria-label="Tool"
            className="w-44"
          />
          <Input
            name={ActivityParam.RULE_ID}
            defaultValue={v.ruleId}
            placeholder="Rule"
            aria-label="Rule"
            className="w-40"
          />
          <Input
            name={ActivityParam.POLICY_VERSION}
            defaultValue={v.policyVersion}
            placeholder="Policy v"
            aria-label="Policy version"
            type="number"
            min={1}
            className="w-28"
          />
          <Input
            name={ActivityParam.FROM}
            defaultValue={v.from}
            type="datetime-local"
            aria-label="From"
            className="w-auto"
          />
          <Input
            name={ActivityParam.TO}
            defaultValue={v.to}
            type="datetime-local"
            aria-label="To"
            className="w-auto"
          />
        </div>
      </details>
    </Form>
  );
}
