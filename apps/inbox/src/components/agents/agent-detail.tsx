"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Card, CardContent, CardHeader, CardTitle } from "@intentlock/ui/components/card";
import { cn } from "@intentlock/ui/lib/utils";
import Link from "next/link";

import { DecisionTable } from "@/components/activity/decision-table";
import { ApiKeysTable } from "@/components/agents/api-keys-table";
import { useMe } from "@/components/app-shell";
import Loader from "@/components/loader";
import { PolicyPanel } from "@/components/policy/policy-panel";
import { VerdictBadge } from "@/components/verdict-badge";
import { parseFilters } from "@/lib/activity-filters";
import { ApiError, apiUrl } from "@/lib/api";
import { AgentTab } from "@/lib/enums/agent-tab.enum";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { formatTime } from "@/lib/format";
import { type AgentView, AgentView as AgentViewSchema } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";
import { can } from "@/lib/permissions";
import { UiAction } from "@/lib/enums/ui-action.enum";

const TABS: { tab: AgentTab; label: string; action?: UiAction }[] = [
  { tab: AgentTab.OVERVIEW, label: "Overview" },
  { tab: AgentTab.POLICY, label: "Policy" },
  { tab: AgentTab.API_KEYS, label: "API keys", action: UiAction.MANAGE_API_KEYS },
  { tab: AgentTab.ACTIVITY, label: "Activity" },
];

function Overview({ agent }: { agent: AgentView }) {
  const counts = [
    [AuditVerdict.ALLOW, agent.last24h.allow],
    [AuditVerdict.BLOCK, agent.last24h.block],
    [AuditVerdict.HOLD, agent.last24h.hold],
  ] as const;
  return (
    <div className="grid gap-4">
      <Card size="sm">
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd>{agent.disabledAt ? `disabled ${formatTime(agent.disabledAt)}` : "enabled"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Active policy</dt>
              <dd>{agent.policyVersion ? `v${agent.policyVersion}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Active API keys</dt>
              <dd>{agent.activeKeys}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Created</dt>
              <dd>{formatTime(agent.createdAt)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Last 24 hours</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-8">
          {counts.map(([verdict, count]) => (
            <div key={verdict}>
              <VerdictBadge verdict={verdict} />
              <div className="text-2xl tabular-nums">{count}</div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function AgentDetail({ agentId, tab }: { agentId: string; tab: AgentTab }) {
  const me = useMe();
  const { data: agent, error } = useApi(
    apiUrl(API_ENDPOINTS.AGENT, { params: { id: agentId } }),
    AgentViewSchema,
  );

  if (error instanceof ApiError && error.status === HttpStatus.NOT_FOUND) {
    return <p className="text-sm text-muted-foreground">Agent not found.</p>;
  }
  if (error) return <p className="text-sm text-destructive">Could not load this agent.</p>;
  if (!agent) return <Loader />;

  const tabs = TABS.filter((t) => !t.action || can(me.role, t.action));
  const current = tabs.some((t) => t.tab === tab) ? tab : AgentTab.OVERVIEW;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/agents" className="text-xs text-muted-foreground hover:underline">
          Agents
        </Link>
        <h1 className="text-2xl font-semibold">{agent.name}</h1>
        {agent.description && <p className="text-sm text-muted-foreground">{agent.description}</p>}
      </div>
      <nav className="flex gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.tab}
            href={`/agents/${agentId}?tab=${t.tab}`}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
              current === t.tab && "border-foreground text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {current === AgentTab.OVERVIEW && <Overview agent={agent} />}
      {current === AgentTab.POLICY && <PolicyPanel agentId={agentId} />}
      {current === AgentTab.API_KEYS && <ApiKeysTable agentId={agentId} />}
      {current === AgentTab.ACTIVITY && (
        <DecisionTable filters={{ ...parseFilters({}), agentId }} agents={[agent]} />
      )}
    </div>
  );
}
