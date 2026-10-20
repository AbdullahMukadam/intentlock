"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import {
  Panel,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import { CircleCheck, Hand, Hourglass, TriangleAlert } from "lucide-react";

import { agentNames, useAgents } from "@/components/agent-filter";
import { EmptyState } from "@/components/empty-state";
import { HoldCard } from "@/components/holds/hold-card";
import { apiUrl } from "@/lib/api";
import { HoldState } from "@/lib/enums/hold-state.enum";
import { type PendingHold, PendingHolds } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const POLL_MS = 10_000;

function Section({
  title,
  icon: Icon,
  holds,
  empty,
  names,
  reload,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  holds: PendingHold[] | undefined;
  empty: { title: string; description: string };
  names: Map<string, string>;
  reload: () => void;
}) {
  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Icon />
          {title}
          {holds && <PanelCount>{holds.length}</PanelCount>}
        </PanelTitle>
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
              <HoldCard key={h.id} hold={h} agentName={names.get(h.agentId)} onResolved={reload} />
            ))}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

export function HoldList() {
  const { agents } = useAgents();
  const { data, error, reload } = useApi(
    apiUrl(API_ENDPOINTS.HOLDS, { query: { status: HoldState.PENDING } }),
    PendingHolds,
    { refetchInterval: POLL_MS },
  );

  if (error && !data) {
    return (
      <Panel>
        <PanelBody className="p-0">
          <EmptyState
            icon={TriangleAlert}
            title="Could not load holds"
            description="The server did not answer. This page retries every 10 seconds."
          />
        </PanelBody>
      </Panel>
    );
  }

  const names = agentNames(agents);
  return (
    <div className="grid gap-6">
      <Section
        title="Waiting for you"
        icon={Hand}
        holds={data?.filter((h) => h.canApprove)}
        empty={{
          title: "You're all caught up",
          description:
            "Nothing needs your approval. When an agent hits a hold rule, the call appears here instantly.",
        }}
        names={names}
        reload={reload}
      />
      <Section
        title="Waiting for someone else"
        icon={Hourglass}
        holds={data?.filter((h) => !h.canApprove)}
        empty={{
          title: "No other pending holds",
          description: "Holds that other approvers must resolve show up here while they wait.",
        }}
        names={names}
        reload={reload}
      />
    </div>
  );
}
