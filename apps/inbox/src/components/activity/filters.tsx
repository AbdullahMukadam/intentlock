"use client";

import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import Form from "next/form";
import Link from "next/link";

import { AgentFilter } from "@/components/agent-filter";
import { NativeSelect } from "@/components/native-select";
import type { ActivityFilters } from "@/lib/activity-filters";
import { ActivityParam } from "@/lib/enums/activity-param.enum";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import type { AgentSummary } from "@/lib/schemas";

export function Filters({
  values: v,
  agents,
}: {
  values: ActivityFilters;
  agents: AgentSummary[];
}) {
  return (
    <Form action="/activity" className="flex flex-wrap gap-2">
      <Input
        name={ActivityParam.Q}
        defaultValue={v.q}
        placeholder="Search kind, tool, rule, user"
        aria-label="Search"
        className="max-w-xs"
      />
      <AgentFilter agents={agents} name={ActivityParam.AGENT_ID} defaultValue={v.agentId} />
      <NativeSelect aria-label="Verdict" name={ActivityParam.VERDICT} defaultValue={v.verdict}>
        <option value="">Any verdict</option>
        {Object.values(AuditVerdict).map((verdict) => (
          <option key={verdict} value={verdict}>
            {verdict}
          </option>
        ))}
      </NativeSelect>
      <Input
        name={ActivityParam.USER}
        defaultValue={v.user}
        placeholder="User email"
        aria-label="User"
        className="w-48"
      />
      <Input
        name={ActivityParam.TOOL}
        defaultValue={v.tool}
        placeholder="Tool"
        aria-label="Tool"
        className="w-40"
      />
      <Input
        name={ActivityParam.RULE_ID}
        defaultValue={v.ruleId}
        placeholder="Rule"
        aria-label="Rule"
        className="w-36"
      />
      <Input
        name={ActivityParam.POLICY_VERSION}
        defaultValue={v.policyVersion}
        placeholder="Policy v"
        aria-label="Policy version"
        type="number"
        min={1}
        className="w-24"
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
      <Button type="submit">Apply</Button>
      <Button variant="ghost" render={<Link href="/activity" />}>
        Reset
      </Button>
    </Form>
  );
}
