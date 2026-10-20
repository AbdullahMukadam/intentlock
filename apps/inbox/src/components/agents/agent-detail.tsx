"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import { cn } from "@intentlock/ui/lib/utils";
import { ChartColumn, Info, ListChecks, SearchX, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { DecisionTable } from "@/components/activity/decision-table";
import { ApiKeysTable } from "@/components/agents/api-keys-table";
import { useMe } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DetailGrid, DetailItem } from "@/components/detail-grid";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PolicyPanel } from "@/components/policy/policy-panel";
import { parseFilters } from "@/lib/activity-filters";
import { parsePaging } from "@/lib/activity-paging";
import { api, ApiError, apiUrl } from "@/lib/api";
import { AgentTab } from "@/lib/enums/agent-tab.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { errorMessage } from "@/lib/error-message";
import { formatTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { type AgentView, AgentView as AgentViewSchema } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const TABS: { tab: AgentTab; label: string; action?: UiAction; liveOnly?: boolean }[] = [
  { tab: AgentTab.OVERVIEW, label: "Overview" },
  { tab: AgentTab.POLICY, label: "Policy", liveOnly: true },
  {
    tab: AgentTab.API_KEYS,
    label: "API keys",
    action: UiAction.MANAGE_API_KEYS,
    liveOnly: true,
  },
  { tab: AgentTab.ACTIVITY, label: "Activity" },
];

const COUNTS = [
  { key: "allow", label: "Allowed", dot: "bg-success" },
  { key: "block", label: "Blocked", dot: "bg-destructive" },
  { key: "hold", label: "Held", dot: "bg-warning" },
] as const;

function Overview({ agent }: { agent: AgentView }) {
  return (
    <div className="grid gap-6">
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <Info />
            Details
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="p-0">
          <DetailGrid className="-mb-px">
            <DetailItem label="Status">
              {agent.deletedAt
                ? `Deleted ${formatTime(agent.deletedAt)}`
                : agent.disabledAt
                  ? `Disabled ${formatTime(agent.disabledAt)}`
                  : "Enabled"}
            </DetailItem>
            <DetailItem label="Active policy">
              {agent.policyVersion ? `v${agent.policyVersion}` : "—"}
            </DetailItem>
            <DetailItem label="Active API keys">{agent.activeKeys}</DetailItem>
            <DetailItem label="Created">{formatTime(agent.createdAt)}</DetailItem>
          </DetailGrid>
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <ChartColumn />
            Last 24 hours
          </PanelTitle>
        </PanelHeader>
        <PanelBody className="grid grid-cols-3 divide-x overflow-hidden p-0">
          {COUNTS.map((c) => (
            <div key={c.key} className="p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden className={cn("size-1.5 rounded-full", c.dot)} />
                {c.label}
              </div>
              <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
                {agent.last24h[c.key]}
              </div>
            </div>
          ))}
        </PanelBody>
      </Panel>
    </div>
  );
}

function DeleteAgent({ agent }: { agent: AgentView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function remove() {
    try {
      await api(API_ENDPOINTS.AGENT, z.undefined(), {
        method: HttpMethod.DELETE,
        params: { id: agent.id },
      });
      toast.success(`Deleted ${agent.name}`);
      router.push("/agents");
    } catch (e) {
      toast.error(errorMessage(e, "Could not delete the agent."));
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2 /> Delete
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${agent.name}?`}
        description="Its API keys are revoked, its pending holds are rejected, and it stops counting against your license. Its history stays in Activity, marked deleted. This can't be undone."
        confirmLabel="Delete agent"
        confirmText={agent.name}
        onConfirm={remove}
      />
    </>
  );
}

export function AgentDetail({ agentId, tab }: { agentId: string; tab: AgentTab }) {
  const me = useMe();
  const { data: agent, error } = useApi(
    apiUrl(API_ENDPOINTS.AGENT, { params: { id: agentId } }),
    AgentViewSchema,
  );

  if (error) {
    const notFound = error instanceof ApiError && error.status === HttpStatus.NOT_FOUND;
    return (
      <Panel>
        <PanelBody className="p-0">
          <EmptyState
            icon={notFound ? SearchX : TriangleAlert}
            title={notFound ? "Agent not found" : "Could not load this agent"}
            action={
              <Link
                href="/agents"
                className="text-sm font-medium underline-offset-4 hover:underline"
              >
                Back to agents
              </Link>
            }
          />
        </PanelBody>
      </Panel>
    );
  }
  if (!agent) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const tabs = TABS.filter(
    (t) => (!t.action || can(me.role, t.action)) && (!agent.deletedAt || !t.liveOnly),
  );
  const current = tabs.some((t) => t.tab === tab) ? tab : AgentTab.OVERVIEW;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={
          <Link href="/agents" className="hover:text-foreground">
            Agents
          </Link>
        }
        title={agent.name}
        description={agent.description ?? undefined}
        actions={
          agent.deletedAt ? (
            <Badge>Deleted</Badge>
          ) : (
            <div className="flex items-center gap-2">
              {agent.disabledAt ? (
                <Badge>Disabled</Badge>
              ) : (
                <Badge tone="success">
                  <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  Enabled
                </Badge>
              )}
              {can(me.role, UiAction.DELETE_AGENT) && <DeleteAgent agent={agent} />}
            </div>
          )
        }
      />
      <nav className="-mt-1 flex gap-1 overflow-x-auto border-b" aria-label="Agent sections">
        {tabs.map((t) => (
          <Link
            key={t.tab}
            href={`/agents/${agentId}?tab=${t.tab}`}
            aria-current={current === t.tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              current === t.tab && "border-foreground font-medium text-foreground",
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
        <Panel>
          <PanelHeader>
            <PanelTitle>
              <ListChecks />
              Decisions for {agent.name}
            </PanelTitle>
          </PanelHeader>
          <DecisionTable
            filters={{ ...parseFilters({}), agentId }}
            paging={parsePaging({})}
            agents={[agent]}
          />
        </Panel>
      )}
    </div>
  );
}
