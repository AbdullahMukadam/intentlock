"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Badge } from "@intentlock/ui/components/badge";
import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import {
  Panel,
  PanelActions,
  PanelBody,
  PanelCount,
  PanelHeader,
  PanelTitle,
} from "@intentlock/ui/components/panel";
import { Skeleton } from "@intentlock/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import { KeyRound, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { EmptyState } from "@/components/empty-state";
import { SecretReveal } from "@/components/secret-reveal";
import { api, apiUrl } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { formatRelative, formatTime } from "@/lib/format";
import { ApiKeyViews, NewApiKey } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HEADERS = ["Name", "Prefix", "Created", "Last used", "Status", ""];

export function ApiKeysTable({ agentId }: { agentId: string }) {
  const { data, error, reload } = useApi(
    apiUrl(API_ENDPOINTS.AGENT_API_KEYS, { params: { id: agentId } }),
    ApiKeyViews,
  );
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(form: FormData) {
    setBusy(true);
    try {
      const created = await api(API_ENDPOINTS.AGENT_API_KEYS, NewApiKey, {
        method: HttpMethod.POST,
        params: { id: agentId },
        body: { name: form.get("name") },
      });
      setRevealed(created.key);
      reload();
    } catch {
      toast.error("Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(keyId: string, name: string) {
    if (!window.confirm(`Revoke "${name}"? Agents using it can no longer sign new plans.`)) return;
    try {
      await api(API_ENDPOINTS.AGENT_API_KEY, z.undefined(), {
        method: HttpMethod.DELETE,
        params: { id: agentId, keyId },
      });
      toast.success(`Revoked ${name}`);
    } catch {
      toast.error("Could not revoke the key.");
    }
    reload();
  }

  return (
    <div className="grid gap-4">
      {revealed && (
        <SecretReveal
          title="Copy your new API key now"
          description="It is shown once; only its hash is stored. Put it in your agent app's environment as INTENTLOCK_API_KEY."
          secret={revealed}
          onDone={() => setRevealed(null)}
        />
      )}
      <Panel>
        <PanelHeader className="flex-wrap">
          <PanelTitle>
            <KeyRound />
            API keys
            {data && <PanelCount>{data.filter((k) => !k.revokedAt).length}</PanelCount>}
          </PanelTitle>
          <PanelActions>
            <form action={create} className="flex gap-2">
              <Input
                name="name"
                aria-label="Key name"
                placeholder="Where it runs, e.g. production"
                maxLength={64}
                required
                className="h-8 w-56"
              />
              <Button type="submit" size="sm" disabled={busy}>
                <Plus /> Create key
              </Button>
            </form>
          </PanelActions>
        </PanelHeader>
        {error ? (
          <PanelBody className="p-0">
            <EmptyState icon={TriangleAlert} title="Could not load API keys" />
          </PanelBody>
        ) : !data ? (
          <PanelBody className="grid gap-2">
            <Skeleton className="h-10" />
          </PanelBody>
        ) : data.length === 0 ? (
          <PanelBody className="p-0">
            <EmptyState
              icon={KeyRound}
              title="No API keys yet"
              description="Create one key per place the agent runs, such as production or staging. Name it above."
            />
          </PanelBody>
        ) : (
          <PanelBody className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {HEADERS.map((h, i) => (
                    <TableHead key={i}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {k.prefix}…
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span title={formatTime(k.createdAt)}>{formatRelative(k.createdAt)}</span>
                      <span className="block text-xs">by {k.createdBy}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {k.lastUsedAt ? formatRelative(k.lastUsedAt) : "never"}
                    </TableCell>
                    <TableCell>
                      {k.revokedAt ? (
                        <Badge>Revoked</Badge>
                      ) : (
                        <Badge tone="success">
                          <span aria-hidden className="size-1.5 rounded-full bg-current" />
                          Active
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!k.revokedAt && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => revoke(k.id, k.name)}
                        >
                          Revoke
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </PanelBody>
        )}
      </Panel>
    </div>
  );
}
