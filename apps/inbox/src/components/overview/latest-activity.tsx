"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Input } from "@intentlock/ui/components/input";
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
  Search,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { agentNames } from "@/components/agent-filter";
import { EmptyState } from "@/components/empty-state";
import { activityWindow } from "@/lib/activity-window";
import { apiUrl } from "@/lib/api";
import { ActivityWindow } from "@/lib/enums/activity-window.enum";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import { formatRelative, humanize } from "@/lib/format";
import { type AgentSummary, AuditPage, type AuditRow } from "@/lib/schemas";
import { LATEST_ACTIVITY_LIMIT } from "@/lib/constants";
import { errorMessage } from "@/lib/error-message";
import { useApi } from "@/lib/use-api";

const POLL_MS = 15_000;
const SEARCH_DEBOUNCE_MS = 300;

const WINDOWS: Record<ActivityWindow, { tab: string; count: string }> = {
  [ActivityWindow.TODAY]: { tab: "Today", count: "today" },
  [ActivityWindow.YESTERDAY]: { tab: "Yesterday", count: "yesterday" },
  [ActivityWindow.WEEK]: { tab: "This week", count: "this week" },
};

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

const BLUR_LAYERS = [0.5, 1, 2, 4, 8];

function ProgressiveBlur() {
  const step = 100 / BLUR_LAYERS.length;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20">
      {BLUR_LAYERS.map((px, i) => {
        const mask = `linear-gradient(to bottom, transparent ${i * step}%, black ${(i + 1) * step}%)`;
        return (
          <div
            key={px}
            className="absolute inset-0"
            style={{ backdropFilter: `blur(${px}px)`, maskImage: mask, WebkitMaskImage: mask }}
          />
        );
      })}
      <div className="absolute inset-0 bg-linear-to-b from-transparent to-card" />
    </div>
  );
}

export function LatestActivity({ agentId, agents }: { agentId: string; agents: AgentSummary[] }) {
  const [window, setWindow] = useState(ActivityWindow.TODAY);
  const [span, setSpan] = useState(() => activityWindow(ActivityWindow.TODAY, new Date()));
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, error } = useApi(
    apiUrl(API_ENDPOINTS.AUDIT, {
      query: { limit: LATEST_ACTIVITY_LIMIT, page: 1, from: span.from, to: span.to, agentId, q },
    }),
    AuditPage,
    { refetchInterval: POLL_MS },
  );
  const names = agentNames(agents);

  return (
    <Panel className="h-[32rem] xl:absolute xl:inset-0 xl:h-auto">
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
      <PanelBody className="flex min-h-0 flex-col overflow-hidden p-0">
        <div className="grid gap-3 p-4 pb-0">
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Time window">
            {Object.values(ActivityWindow).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={w === window}
                onClick={() => {
                  setWindow(w);
                  setSpan(activityWindow(w, new Date()));
                }}
                className={cn(
                  "h-8 rounded-lg border text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  w === window
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {WINDOWS[w].tab}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search activities"
              aria-label="Search activities"
              className="pl-9"
            />
          </div>
          <p className="border-b border-dashed pb-3 text-xs text-muted-foreground">
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {data?.total ?? "–"}
            </span>{" "}
            {data?.total === 1 ? "activity" : "activities"} {WINDOWS[window].count}
          </p>
        </div>
        {error && !data ? (
          <EmptyState
            className="flex-1"
            icon={TriangleAlert}
            title="Could not load activity"
            description={errorMessage(error, "It retries automatically.")}
          />
        ) : !data ? (
          <div className="grid gap-3 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : data.entries.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={Activity}
            title={q ? "No matches" : "Nothing yet"}
            description={
              q
                ? "Try another word, or a wider time window."
                : "Plans, decisions, approvals and policy changes appear here as they happen."
            }
          />
        ) : (
          <div className="relative min-h-0 flex-1">
            <ol className="relative h-full overflow-y-auto px-4 pt-2 pb-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                        {who || (row.ruleId ? `rule ${row.ruleId}` : `entry #${row.seq}`)}
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
            <ProgressiveBlur />
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
