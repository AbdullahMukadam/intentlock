"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@intentlock/ui/components/card";
import { Textarea } from "@intentlock/ui/components/textarea";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { formatTime } from "@/lib/format";
import { HoldView, type PendingHold } from "@/lib/schemas";

function message(error: unknown) {
  if (error instanceof ApiError && error.code === ApiErrorCode.HOLD_NOT_PENDING) {
    return "Someone else resolved this hold, or it expired.";
  }
  if (error instanceof ApiError && error.code === ApiErrorCode.NOT_AN_APPROVER) {
    return "You are not an approver for this hold.";
  }
  return "Could not save your decision.";
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
  const [busy, setBusy] = useState(false);

  async function resolve(approve: boolean) {
    setBusy(true);
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
      setBusy(false);
      onResolved();
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-mono">{hold.tool}</CardTitle>
        <CardDescription>
          {agentName ?? hold.agentId} for {hold.user} · rule{" "}
          <span className="font-mono">{hold.ruleId}</span> · expires {formatTime(hold.expiresAt)}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <pre className="max-h-48 overflow-auto bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap">
          {JSON.stringify(hold.args, null, 2)}
        </pre>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Requested {formatTime(hold.createdAt)}</span>
          <Link href={`/runs/${hold.planId}`} className="underline-offset-4 hover:underline">
            View run
          </Link>
        </div>
        {hold.canApprove ? (
          <div className="grid gap-2">
            <Textarea
              aria-label="Note"
              placeholder="Note (optional)"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={() => resolve(true)} disabled={busy}>
                Approve
              </Button>
              <Button variant="destructive" onClick={() => resolve(false)} disabled={busy}>
                Reject
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Waiting for an approver.</p>
        )}
      </CardContent>
    </Card>
  );
}
