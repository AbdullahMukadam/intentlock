"use client";

import { Button } from "@intentlock/ui/components/button";
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { Flag, Link2, RefreshCw, ShieldCheck, ShieldX, TriangleAlert } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { auditSummaryUrl, auditVerifyQuery } from "@/lib/audit-verify";
import { queryKeyFor } from "@/lib/query-client";
import { humanize } from "@/lib/format";
import type { AuditVerifyResult } from "@/lib/schemas";

function Result({ result: r, at }: { result: AuditVerifyResult; at: Date }) {
  const Icon = r.ok ? ShieldCheck : ShieldX;
  return (
    <div className="grid gap-4 p-4">
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4",
          r.ok ? "border-success/25 bg-success/8" : "border-destructive/25 bg-destructive/8",
        )}
      >
        <Icon
          className={cn("mt-0.5 size-5 shrink-0", r.ok ? "text-success" : "text-destructive")}
        />
        <div>
          <p className="text-sm font-medium">
            {r.ok
              ? `Chain intact${r.fromSeq ? ` from entry #${r.fromSeq}` : ""}: ${r.count.toLocaleString()} entries recomputed, every hash matches.`
              : `Chain broken at entry #${r.firstBrokenSeq}.`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {r.ok
              ? `Checked ${at.toLocaleString()}.${r.fromSeq ? " Earlier entries were archived and deleted; check them with the CLI." : ""}`
              : `${r.count.toLocaleString()} entries verified before it. An entry was edited or deleted after it was written.`}
          </p>
        </div>
      </div>
      {r.flagged.length > 0 && (
        <div className="grid gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Flag className="size-4 text-destructive" />
            {r.flagged.length} flagged client {r.flagged.length === 1 ? "entry" : "entries"}
          </p>
          <p className="text-xs text-muted-foreground">
            Decided more loosely than the server&apos;s policy, or with a gap in the client chain.
          </p>
          <ul className="grid divide-y rounded-lg border text-xs">
            {r.flagged.map((f) => (
              <li key={f.seq} className="flex justify-between gap-3 px-3 py-2">
                {f.planId ? (
                  <Link
                    href={`/runs/${f.planId}`}
                    className="font-mono underline-offset-2 hover:underline"
                  >
                    #{f.seq}
                  </Link>
                ) : (
                  <span className="font-mono">#{f.seq}</span>
                )}
                <span className="text-muted-foreground">{humanize(f.flagged)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function VerifyButton() {
  const query = useQuery(auditVerifyQuery);
  const client = useQueryClient();
  const busy = query.isFetching;
  const error = query.isError && !busy;
  const state = query.data ? { result: query.data, at: new Date(query.dataUpdatedAt) } : null;

  function verify() {
    query
      .refetch()
      .then(() => client.invalidateQueries({ queryKey: queryKeyFor(auditSummaryUrl) }))
      .catch(() => undefined);
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Link2 />
          Hash chain
        </PanelTitle>
        <PanelActions>
          <Button size="sm" onClick={verify} loading={busy}>
            {!busy && <RefreshCw />}
            {busy ? "Verifying…" : state ? "Verify again" : "Verify now"}
          </Button>
        </PanelActions>
      </PanelHeader>
      <PanelBody className="p-0">
        {error ? (
          <EmptyState
            icon={TriangleAlert}
            title="Verification request failed"
            description="The server did not answer. Try again in a moment."
          />
        ) : state ? (
          <Result result={state.result} at={state.at} />
        ) : (
          <EmptyState
            icon={ShieldCheck}
            title="Not verified yet"
            description="Verifying recomputes the hash of every entry from the first one and checks that each links to the one before it. Any edit or deletion breaks the chain at that entry. Use Verify now above."
          />
        )}
      </PanelBody>
    </Panel>
  );
}
