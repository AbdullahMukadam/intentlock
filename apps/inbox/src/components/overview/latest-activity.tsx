"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import { cn } from "@intentlock/ui/lib/utils";
import {
  Activity,
  ArrowUpRight,
  CircleCheck,
  CircleX,
  FileSignature,
  Hand,
  KeyRound,
  LogIn,
  ScrollText,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { apiUrl } from "@/lib/api";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import { EventName } from "@/lib/enums/event-name.enum";
import { formatRelative, humanize } from "@/lib/format";
import { type AgentSummary, AuditPage, type AuditRow } from "@/lib/schemas";
import { useEvents } from "@/lib/socket";
import { useApi } from "@/lib/use-api";

const LIMIT = 8;
const POLL_MS = 15_000;
const EVENTS = [EventName.DECISION, EventName.HOLD_CREATED, EventName.HOLD_RESOLVED];

type Look = { icon: React.ComponentType<{ className?: string }>; tone: string };

const NEUTRAL = "text-muted-foreground";

function look(row: AuditRow): Look {
  switch (row.verdict) {
    case AuditVerdict.ALLOW:
      return { icon: ShieldCheck, tone: "text-success" };
    case AuditVerdict.BLOCK:
      return { icon: ShieldX, tone: "text-destructive" };
    case AuditVerdict.HOLD:
      return { icon: Hand, tone: "text-warning" };
    case AuditVerdict.APPROVED:
      return { icon: CircleCheck, tone: "text-success" };
    case AuditVerdict.REJECTED:
    case AuditVerdict.EXPIRED:
      return { icon: CircleX, tone: "text-destructive" };
  }
  if (row.kind.startsWith("plan_")) return { icon: FileSignature, tone: "text-info" };
  if (row.kind.startsWith("policy_")) return { icon: ScrollText, tone: "text-violet" };
  if (row.kind.startsWith("auth_") || row.kind.startsWith("setup_"))
    return { icon: LogIn, tone: NEUTRAL };
  if (row.kind.includes("key")) return { icon: KeyRound, tone: NEUTRAL };
  return { icon: Activity, tone: NEUTRAL };
}

const PAST_TENSE: Record<AuditVerdict, string> = {
  [AuditVerdict.ALLOW]: "allowed",
  [AuditVerdict.BLOCK]: "blocked",
  [AuditVerdict.HOLD]: "held",
  [AuditVerdict.APPROVED]: "approved",
  [AuditVerdict.REJECTED]: "rejected",
  [AuditVerdict.EXPIRED]: "expired",
};

function title(row: AuditRow): React.ReactNode {
  if (!row.tool || !row.verdict) {
    const text = humanize(row.kind);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const verb = (PAST_TENSE as Record<string, string | undefined>)[row.verdict] ?? row.verdict;
  return (
    <>
      {verb.charAt(0).toUpperCase() + verb.slice(1)}{" "}
      <span className="font-mono text-xs font-normal">{row.tool}</span>
    </>
  );
}

export function LatestActivity({ agentId, agents }: { agentId: string; agents: AgentSummary[] }) {
  const { data, reload } = useApi(
    apiUrl(API_ENDPOINTS.AUDIT, { query: { limit: LIMIT, agentId } }),
    AuditPage,
  );
  useEvents(EVENTS, reload, POLL_MS);
  const names = new Map(agents.map((a) => [a.id, a.name]));

  return (
    <Panel className="h-full">
      <PanelHeader>
        <PanelTitle>
          <Activity />
          Latest activity
        </PanelTitle>
        <Link
          href="/activity"
          className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          View all <ArrowUpRight className="size-3.5" />
        </Link>
      </PanelHeader>
      <PanelBody className="p-0">
        {!data ? (
          <div className="grid gap-3 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.entries.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="Nothing yet"
            description="Plans, decisions, approvals and policy changes appear here as they happen."
          />
        ) : (
          <ol className="relative px-4 py-2">
            {data.entries.map((row, i) => {
              const { icon: Icon, tone } = look(row);
              const who = [row.agentId && (names.get(row.agentId) ?? "agent"), row.user]
                .filter(Boolean)
                .join(" · ");
              const body = (
                <>
                  <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card shadow-xs">
                    <Icon className={cn("size-4", tone)} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-medium">{title(row)}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                        {formatRelative(row.at)}
                      </span>
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {who || (row.ruleId ? `rule ${row.ruleId}` : `#${row.seq}`)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={row.seq} className="relative">
                  {i < data.entries.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute top-10 bottom-0 left-4 w-px border-l border-dashed"
                    />
                  )}
                  {row.planId ? (
                    <Link
                      href={`/runs/${row.planId}`}
                      className="-mx-2 flex gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/40"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex gap-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </PanelBody>
    </Panel>
  );
}
