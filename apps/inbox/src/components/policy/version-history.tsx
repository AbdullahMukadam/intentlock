"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@intentlock/ui/components/card";
import { useState } from "react";
import { toast } from "sonner";

import { DiffView } from "@/components/policy/diff-view";
import Loader from "@/components/loader";
import { api, apiUrl } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import { formatTime } from "@/lib/format";
import {
  type PolicyVersionSummary,
  PolicyVersionView,
  type PolicyVersionView as PolicyVersionViewType,
} from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

export function VersionHistory({
  agentId,
  versions,
  active,
  isAdmin,
  onChanged,
}: {
  agentId: string;
  versions: PolicyVersionSummary[];
  active: PolicyVersionViewType;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const shown = useApi(
    selected === null
      ? null
      : apiUrl(API_ENDPOINTS.AGENT_POLICY_VERSION, { params: { id: agentId, version: selected } }),
    PolicyVersionView,
  );

  async function rollback(version: number) {
    const message = window.prompt(
      `Message for rolling back to v${version}`,
      `Roll back to v${version}`,
    );
    if (!message?.trim()) return;
    try {
      const created = await api(API_ENDPOINTS.AGENT_POLICY_ROLLBACK, PolicyVersionView, {
        method: HttpMethod.POST,
        params: { id: agentId },
        body: { toVersion: version, message: message.trim() },
      });
      toast.success(`Published v${created.version} (copy of v${version})`);
      setSelected(null);
    } catch (e) {
      toast.error(errorMessage(e, "Rollback failed."));
    }
    onChanged();
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="-my-2 grid divide-y text-sm">
          {versions.map((v) => {
            const isActive = v.version === active.version;
            return (
              <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <Badge className="w-10 justify-center font-mono">v{v.version}</Badge>
                <span className="min-w-40 flex-1">
                  {v.message ?? <span className="text-muted-foreground">no message</span>}
                  {v.rolledBackFrom && (
                    <span className="text-muted-foreground"> · copy of v{v.rolledBackFrom}</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{formatTime(v.createdAt)}</span>
                {isActive ? (
                  <Badge tone="success">active</Badge>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelected(selected === v.version ? null : v.version)}
                    >
                      {selected === v.version ? "Hide diff" : "Diff vs active"}
                    </Button>
                    {isAdmin && (
                      <Button variant="outline" size="sm" onClick={() => rollback(v.version)}>
                        Roll back
                      </Button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
        {selected !== null &&
          (shown.data ? (
            <DiffView
              before={shown.data.source}
              after={active.source}
              beforeLabel={`v${shown.data.version}`}
              afterLabel={`v${active.version} (active)`}
            />
          ) : shown.error ? (
            <p className="text-sm text-destructive">Could not load v{selected}.</p>
          ) : (
            <Loader />
          ))}
      </CardContent>
    </Card>
  );
}
