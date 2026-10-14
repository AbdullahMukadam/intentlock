"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Download } from "lucide-react";

import { DecisionTable } from "@/components/activity/decision-table";
import { Filters } from "@/components/activity/filters";
import { useAgents } from "@/components/agent-filter";
import { type ActivityFilters, toAuditQuery } from "@/lib/activity-filters";
import { apiUrl } from "@/lib/api";
import { AuditFormat } from "@/lib/enums/audit-format.enum";

export function ActivityView({ filters }: { filters: ActivityFilters }) {
  const agents = useAgents();
  const key = JSON.stringify(filters);
  const exportUrl = apiUrl(API_ENDPOINTS.AUDIT, {
    query: { ...toAuditQuery(filters), format: AuditFormat.JSONL },
  });
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Activity</h1>
        <Button variant="outline" render={<a href={exportUrl} download="intentlock-audit.jsonl" />}>
          <Download />
          Export JSONL
        </Button>
      </div>
      <Filters key={`f${key}`} values={filters} agents={agents} />
      <DecisionTable key={`t${key}`} filters={filters} agents={agents} />
    </div>
  );
}
