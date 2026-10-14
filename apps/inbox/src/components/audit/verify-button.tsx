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
import { CircleCheck, CircleX, Flag } from "lucide-react";
import { useState } from "react";

import { api } from "@/lib/api";
import { AuditVerdict } from "@/lib/enums/audit-verdict.enum";
import {
  type AuditVerifyResult,
  AuditVerifyResult as AuditVerifyResultSchema,
} from "@/lib/schemas";
import { VERDICT_COLORS } from "@/lib/verdict-colors";

function Result({ result: r, at }: { result: AuditVerifyResult; at: Date }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        {r.ok ? (
          <CircleCheck
            aria-hidden
            className="size-5"
            style={{ color: VERDICT_COLORS[AuditVerdict.ALLOW] }}
          />
        ) : (
          <CircleX
            aria-hidden
            className="size-5"
            style={{ color: VERDICT_COLORS[AuditVerdict.BLOCK] }}
          />
        )}
        {r.ok
          ? `Chain intact: ${r.count} entries recomputed, every hash matches.`
          : `Chain broken at entry #${r.firstBrokenSeq} (${r.count} entries verified before it).`}
      </p>
      <p className="text-xs text-muted-foreground">Checked {at.toLocaleString()}</p>
      {r.flagged.length > 0 && (
        <div className="grid gap-1">
          <p className="flex items-center gap-1 text-sm">
            <Flag aria-hidden className="size-4 text-destructive" />
            {r.flagged.length} flagged client entries (decided more loosely than the server&apos;s
            policy):
          </p>
          <ul className="grid gap-0.5 text-xs">
            {r.flagged.map((f) => (
              <li key={f.seq}>
                <span className="font-mono">#{f.seq}</span> {f.flagged}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function VerifyButton() {
  const [state, setState] = useState<{ result: AuditVerifyResult; at: Date } | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function verify() {
    setBusy(true);
    setError(false);
    try {
      setState({
        result: await api(API_ENDPOINTS.AUDIT_VERIFY, AuditVerifyResultSchema),
        at: new Date(),
      });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Verify the audit chain</CardTitle>
        <CardDescription>
          Recomputes the hash of every entry from the first one and checks each links to the one
          before it. Any edit or deletion breaks the chain at that entry.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Button onClick={verify} disabled={busy} className="justify-self-start">
          {busy ? "Verifying…" : "Verify now"}
        </Button>
        {error && <p className="text-sm text-destructive">Verification request failed.</p>}
        {state && <Result result={state.result} at={state.at} />}
      </CardContent>
    </Card>
  );
}
