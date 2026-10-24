"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import { Bot, Plus, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CreateAgentForm } from "@/components/agents/create-agent-form";
import { useMe } from "@/components/app-shell";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { apiUrl } from "@/lib/api";
import { UiAction } from "@/lib/enums/ui-action.enum";
import { can } from "@/lib/permissions";
import { AgentViews } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HEADERS = ["Agent", "Status", "Policy", "API keys", "Last 24 h"];

function Count({ value, className }: { value: number; className: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span aria-hidden className={`size-1.5 rounded-full ${className}`} />
      {value}
    </span>
  );
}

export function AgentList() {
  const me = useMe();
  const canCreate = can(me.role, UiAction.CREATE_AGENT);
  const [creating, setCreating] = useState(false);
  const { data, error } = useApi(apiUrl(API_ENDPOINTS.AGENTS), AgentViews);

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Agents"
        description="Each AI application your team runs is one agent, with its own API keys, policy and kill switch."
        actions={
          canCreate && (
            <Button onClick={() => setCreating((c) => !c)}>
              <Plus /> New agent
            </Button>
          )
        }
      />
      {canCreate && creating && <CreateAgentForm onCancel={() => setCreating(false)} />}
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <Bot />
            All agents
            {data && <PanelCount>{data.length}</PanelCount>}
          </PanelTitle>
        </PanelHeader>
        {error ? (
          <PanelBody className="p-0">
            <EmptyState icon={TriangleAlert} title="Could not load agents" />
          </PanelBody>
        ) : !data ? (
          <PanelBody className="grid gap-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </PanelBody>
        ) : data.length === 0 ? (
          <PanelBody className="p-0">
            <EmptyState
              icon={Bot}
              title="No agents yet"
              description="Register an agent, create an API key, and point your app's gate at this server."
              action={
                canCreate && (
                  <Button onClick={() => setCreating(true)}>
                    <Plus /> Register your first agent
                  </Button>
                )
              }
            />
          </PanelBody>
        ) : (
          <PanelBody className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {HEADERS.map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        href={`/agents/${a.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {a.name}
                      </Link>
                      {a.description && (
                        <div className="max-w-md truncate text-xs text-muted-foreground">
                          {a.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell label="Status">
                      {a.disabledAt ? (
                        <Badge>Disabled</Badge>
                      ) : (
                        <Badge tone="success">Enabled</Badge>
                      )}
                    </TableCell>
                    <TableCell label="Policy">
                      {a.policyVersion ? <Badge>v{a.policyVersion}</Badge> : "—"}
                    </TableCell>
                    <TableCell label="API keys" className="tabular-nums">
                      {a.activeKeys}
                    </TableCell>
                    <TableCell label="Last 24 h">
                      <span className="inline-flex gap-4 text-[13px]">
                        <Count value={a.last24h.allow} className="bg-success" />
                        <Count value={a.last24h.block} className="bg-destructive" />
                        <Count value={a.last24h.hold} className="bg-warning" />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
