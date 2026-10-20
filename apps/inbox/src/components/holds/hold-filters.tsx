"use client";

import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";

import { AgentFilter } from "@/components/agent-filter";
import { NativeSelect } from "@/components/native-select";
import { HoldParam } from "@/lib/enums/hold-param.enum";
import { HoldState } from "@/lib/enums/hold-state.enum";
import type { HoldFilters as Filters } from "@/lib/hold-filters";
import type { AgentSummary } from "@/lib/schemas";

export function HoldFilters({ values, agents }: { values: Filters; agents: AgentSummary[] }) {
  return (
    <Form action="/holds" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name={HoldParam.Q}
          defaultValue={values.q}
          placeholder="Search tool, agent, person, rule, arguments"
          aria-label="Search holds"
          className="pl-9"
        />
      </div>
      <AgentFilter agents={agents} name={HoldParam.AGENT_ID} defaultValue={values.agentId} />
      <NativeSelect aria-label="State" name={HoldParam.STATE} defaultValue={values.state}>
        {Object.values(HoldState).map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </NativeSelect>
      <div className="ml-auto flex gap-2">
        <Button variant="ghost" nativeButton={false} render={<Link href="/holds" />}>
          Reset
        </Button>
        <Button type="submit">Apply</Button>
      </div>
    </Form>
  );
}
