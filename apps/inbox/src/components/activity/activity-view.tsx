"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Panel, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Download, ListChecks } from "lucide-react";

import { DecisionTable } from "@/components/activity/decision-table";
import { Filters } from "@/components/activity/filters";
import { useAgents } from "@/components/agent-filter";
import { PageHeader } from "@/components/page-header";
import { type ActivityFilters, toAuditQuery } from "@/lib/activity-filters";
import type { Paging } from "@/lib/activity-paging";
import { apiUrl } from "@/lib/api";
import { AuditFormat } from "@/lib/enums/audit-format.enum";

export function ActivityView({ filters, paging }: { filters: ActivityFilters; paging: Paging }) {
  const { agents, failed: agentsFailed } = useAgents();
  const key = JSON.stringify(filters);
  const exportUrl = apiUrl(API_ENDPOINTS.AUDIT, {
    query: { ...toAuditQuery(filters), format: AuditFormat.JSONL },
  });
  return (
    <div className="grid gap-8">
      <PageHeader
        title="Activity"
        description="Every decision and event in the tamper-evident audit log. Click a run to see its plan and each call in order."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<a href={exportUrl} download="intentlock-audit.jsonl" />}
          >
            <Download />
            Export JSONL
          </Button>
        }
      />
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <ListChecks />
            Decisions
          </PanelTitle>
        </PanelHeader>
        <Filters
          key={`f${key}`}
          values={filters}
          size={paging.size}
          agents={agents}
          agentsFailed={agentsFailed}
        />
        <DecisionTable key={`t${key}`} filters={filters} paging={paging} agents={agents} />
      </Panel>
    </div>
  );
}
