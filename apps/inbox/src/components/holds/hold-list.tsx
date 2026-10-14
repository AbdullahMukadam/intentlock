"use client";

import { API_ENDPOINTS } from "@intentlock/core";

import { useAgents } from "@/components/agent-filter";
import { HoldCard } from "@/components/holds/hold-card";
import Loader from "@/components/loader";
import { apiUrl } from "@/lib/api";
import { EventName } from "@/lib/enums/event-name.enum";
import { HoldState } from "@/lib/enums/hold-state.enum";
import { type PendingHold, PendingHolds } from "@/lib/schemas";
import { useEvents } from "@/lib/socket";
import { useApi } from "@/lib/use-api";

const POLL_MS = 10_000;
const HOLD_EVENTS = [EventName.HOLD_CREATED, EventName.HOLD_RESOLVED];

function Section({
  title,
  holds,
  empty,
  names,
  reload,
}: {
  title: string;
  holds: PendingHold[];
  empty: string;
  names: Map<string, string>;
  reload: () => void;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        {title} ({holds.length})
      </h2>
      {holds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {holds.map((h) => (
            <HoldCard key={h.id} hold={h} agentName={names.get(h.agentId)} onResolved={reload} />
          ))}
        </div>
      )}
    </section>
  );
}

export function HoldList() {
  const agents = useAgents();
  const { data, error, reload } = useApi(
    apiUrl(API_ENDPOINTS.HOLDS, { query: { status: HoldState.PENDING } }),
    PendingHolds,
  );
  useEvents(HOLD_EVENTS, reload, POLL_MS);

  if (error && !data) return <p className="text-sm text-destructive">Could not load holds.</p>;
  if (!data) return <Loader />;

  const names = new Map(agents.map((a) => [a.id, a.name]));
  return (
    <div className="grid gap-8">
      <Section
        title="Waiting for you"
        holds={data.filter((h) => h.canApprove)}
        empty="Nothing needs your approval."
        names={names}
        reload={reload}
      />
      <Section
        title="Waiting for someone else"
        holds={data.filter((h) => !h.canApprove)}
        empty="No other pending holds you can see."
        names={names}
        reload={reload}
      />
    </div>
  );
}
