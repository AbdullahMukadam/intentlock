"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { ArrowUpRight, Bot, Check, Clock, ScrollText, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { MemberLabel } from "@/components/member-label";
import { api } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import { formatRelative } from "@/lib/format";
import { HoldView, type PendingHold } from "@/lib/schemas";

function message(error: unknown) {
  return errorMessage(error, "Could not save your decision.");
}

function Meta({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function HoldCard({
  hold,
  agentName,
  onResolved,
}: {
  hold: PendingHold;
  agentName: string | undefined;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [resolving, setResolving] = useState<boolean | null>(null);

  async function resolve(approve: boolean) {
    setResolving(approve);
    try {
      await api(approve ? API_ENDPOINTS.HOLD_APPROVE : API_ENDPOINTS.HOLD_REJECT, HoldView, {
        method: HttpMethod.POST,
        params: { id: hold.id },
        body: note.trim() ? { note: note.trim() } : {},
      });
      toast.success(approve ? `Approved ${hold.tool}` : `Rejected ${hold.tool}`);
    } catch (e) {
      toast.error(message(e));
    } finally {
      setResolving(null);
      onResolved();
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-mono text-[13px] font-medium">{hold.tool}</h3>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <Meta icon={Bot}>{agentName ?? hold.agentId}</Meta>
            <Meta icon={UserRound}>
              {hold.user}
              <MemberLabel email={hold.user} />
            </Meta>
            <Meta icon={ScrollText}>
              <span className="font-mono">{hold.ruleId}</span>
            </Meta>
          </div>
        </div>
        <Badge tone="warning" className="shrink-0">
          <Clock />
          expires {formatRelative(hold.expiresAt)}
        </Badge>
      </header>
      <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
        {JSON.stringify(hold.args, null, 2)}
      </pre>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Requested {formatRelative(hold.createdAt)}</span>
        <Link
          href={`/runs/${hold.planId}`}
          className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline"
        >
          View run <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
      {hold.canApprove ? (
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
          <Input
            aria-label="Note"
            placeholder="Add a note (optional)"
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            className="sm:flex-1"
          />
          <div className="flex gap-2">
            <Button
              onClick={() => resolve(true)}
              loading={resolving === true}
              disabled={resolving === false}
              className="flex-1"
            >
              {resolving !== true && <Check />} Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => resolve(false)}
              loading={resolving === false}
              disabled={resolving === true}
              className="flex-1 text-destructive hover:text-destructive"
            >
              {resolving !== false && <X />} Reject
            </Button>
          </div>
        </div>
      ) : (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Waiting for an approver: {[...hold.approvers.roles, ...hold.approvers.emails].join(", ")}
          {hold.approvers.self ? " (the requester may approve)" : ""}
        </p>
      )}
    </article>
  );
}
