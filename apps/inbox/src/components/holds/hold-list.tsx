"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Checkbox } from "@intentlock/ui/components/checkbox";
import { Input } from "@intentlock/ui/components/input";
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import { Check, CircleCheck, Hand, History, Hourglass, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { agentNames, useAgents } from "@/components/agent-filter";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { HoldCard } from "@/components/holds/hold-card";
import { HoldFilters } from "@/components/holds/hold-filters";
import { api, apiUrl } from "@/lib/api";
import { HoldState } from "@/lib/enums/hold-state.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import { bulkSummary } from "@/lib/hold-bulk";
import { type HoldFilters as Filters, matchesHold } from "@/lib/hold-filters";
import { BulkResolveResult, type PendingHold, PendingHolds } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const POLL_MS = 10_000;

function Section({
  title,
  icon: Icon,
  holds,
  empty,
  names,
  reload,
  header,
  selected,
  onSelect,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  holds: PendingHold[] | undefined;
  empty: { title: string; description: string };
  names: Map<string, string>;
  reload: () => void;
  header?: React.ReactNode;
  selected?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
}) {
  return (
    <Panel>
      <PanelHeader className="flex-wrap">
        <PanelTitle>
          <Icon />
          {title}
          {holds && <PanelCount>{holds.length}</PanelCount>}
        </PanelTitle>
        {header}
      </PanelHeader>
      <PanelBody className={holds?.length ? "p-3" : "p-0"}>
        {!holds ? (
          <div className="grid gap-3 p-1">
            <Skeleton className="h-28" />
          </div>
        ) : holds.length === 0 ? (
          <EmptyState icon={CircleCheck} title={empty.title} description={empty.description} />
        ) : (
          <div className="grid gap-3">
            {holds.map((h) => (
              <HoldCard
                key={h.id}
                hold={h}
                agentName={names.get(h.agentId)}
                onResolved={reload}
                selected={selected?.has(h.id)}
                onSelect={onSelect && ((value) => onSelect(h.id, value))}
              />
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function BulkBar({
  holds,
  selected,
  setSelected,
  onDone,
}: {
  holds: PendingHold[];
  selected: Set<string>;
  setSelected: (ids: Set<string>) => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<boolean | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const ids = holds.map((h) => h.id).filter((id) => selected.has(id));
  const all = holds.length > 0 && ids.length === holds.length;

  async function resolve(approve: boolean) {
    setBusy(approve);
    try {
      const result = await api(API_ENDPOINTS.HOLDS_RESOLVE, BulkResolveResult, {
        method: HttpMethod.POST,
        body: { ids, approve, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      const text = bulkSummary(result, approve);
      if (result.resolved > 0) toast.success(text);
      else toast.warning(text);
      setSelected(new Set());
      setNote("");
    } catch (e) {
      toast.error(errorMessage(e, "Could not save your decisions."));
    } finally {
      setBusy(null);
      onDone();
    }
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          checked={all}
          indeterminate={ids.length > 0 && !all}
          onCheckedChange={(checked) => setSelected(new Set(checked ? holds.map((h) => h.id) : []))}
          aria-label="Select all shown holds"
        />
        {ids.length > 0 ? `${ids.length} selected` : "Select all"}
      </label>
      {ids.length > 0 && (
        <>
          <Input
            aria-label="Note for selected holds"
            placeholder="Note (optional)"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 w-48"
          />
          <Button
            size="sm"
            onClick={() => resolve(true)}
            loading={busy === true}
            disabled={busy === false}
          >
            {busy !== true && <Check />} Approve {ids.length}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmReject(true)}
            loading={busy === false}
            disabled={busy === true}
          >
            {busy !== false && <X />} Reject {ids.length}
          </Button>
          <ConfirmDialog
            open={confirmReject}
            onOpenChange={setConfirmReject}
            title={`Reject ${ids.length} ${ids.length === 1 ? "hold" : "holds"}?`}
            description={
              note.trim()
                ? `Each agent call is blocked with your note: "${note.trim()}".`
                : "Each agent call is blocked. Holds that expired or were resolved meanwhile are skipped."
            }
            confirmLabel={`Reject ${ids.length}`}
            onConfirm={() => resolve(false)}
          />
        </>
      )}
    </div>
  );
}

const RESOLVED_TITLE: Record<Exclude<HoldState, HoldState.PENDING>, string> = {
  [HoldState.APPROVED]: "Approved holds",
  [HoldState.REJECTED]: "Rejected holds",
  [HoldState.EXPIRED]: "Expired holds",
};

export function HoldList({ filters }: { filters: Filters }) {
  const { agents } = useAgents();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data, error, reload } = useApi(
    apiUrl(API_ENDPOINTS.HOLDS, { query: { status: filters.state } }),
    PendingHolds,
    { refetchInterval: POLL_MS },
  );
  const names = agentNames(agents);
  const shown = data?.filter((h) => matchesHold(h, filters, names.get(h.agentId)));
  const filtered = Boolean(filters.q || filters.agentId);

  const body =
    error && !data ? (
      <Panel>
        <PanelBody className="p-0">
          <EmptyState
            icon={TriangleAlert}
            title="Could not load holds"
            description="The server did not answer. This page retries every 10 seconds."
          />
        </PanelBody>
      </Panel>
    ) : filters.state !== HoldState.PENDING ? (
      <Section
        title={RESOLVED_TITLE[filters.state]}
        icon={History}
        holds={shown}
        empty={{
          title: filtered ? "No holds match" : "Nothing here yet",
          description: filtered
            ? "Try another search or reset the filters."
            : "Resolved holds appear here, newest first (up to 200).",
        }}
        names={names}
        reload={reload}
      />
    ) : (
      <>
        <PendingForYou
          holds={shown?.filter((h) => h.canApprove)}
          names={names}
          reload={reload}
          filtered={filtered}
          selected={selected}
          setSelected={setSelected}
        />
        <Section
          title="Waiting for someone else"
          icon={Hourglass}
          holds={shown?.filter((h) => !h.canApprove)}
          empty={{
            title: filtered ? "No holds match" : "No other pending holds",
            description: filtered
              ? "Try another search or reset the filters."
              : "Holds that other approvers must resolve show up here while they wait.",
          }}
          names={names}
          reload={reload}
        />
      </>
    );

  return (
    <div className="grid gap-6">
      <HoldFilters values={filters} agents={agents} />
      {body}
    </div>
  );
}

function PendingForYou({
  holds,
  names,
  reload,
  filtered,
  selected,
  setSelected,
}: {
  holds: PendingHold[] | undefined;
  names: Map<string, string>;
  reload: () => void;
  filtered: boolean;
  selected: Set<string>;
  setSelected: (ids: Set<string>) => void;
}) {
  return (
    <Section
      title="Waiting for you"
      icon={Hand}
      holds={holds}
      empty={{
        title: filtered ? "No holds match" : "You're all caught up",
        description: filtered
          ? "Try another search or reset the filters."
          : "Nothing needs your approval. When an agent hits a hold rule, the call appears here instantly.",
      }}
      names={names}
      reload={reload}
      header={
        holds && holds.length > 0 ? (
          <BulkBar holds={holds} selected={selected} setSelected={setSelected} onDone={reload} />
        ) : undefined
      }
      selected={selected}
      onSelect={(id, value) => {
        const next = new Set(selected);
        if (value) next.add(id);
        else next.delete(id);
        setSelected(next);
      }}
    />
  );
}
