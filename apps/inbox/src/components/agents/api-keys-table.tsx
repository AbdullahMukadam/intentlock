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
import { Input } from "@intentlock/ui/components/input";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import Loader from "@/components/loader";
import { api, apiUrl } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { formatTime } from "@/lib/format";
import { ApiKeyViews, NewApiKey } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const HEADERS = ["Name", "Prefix", "Created", "Created by", "Last used", "Status", ""];

function RevealedKey({ apiKey, onDone }: { apiKey: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Card size="sm" className="border-primary">
      <CardHeader>
        <CardTitle>Copy your new API key now</CardTitle>
        <CardDescription>It is shown once. Only its hash is stored on the server.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <code className="bg-muted px-2 py-1 font-mono text-xs break-all">{apiKey}</code>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            navigator.clipboard.writeText(apiKey).then(
              () => setCopied(true),
              () => toast.error("Copy failed; select the key and copy it by hand."),
            )
          }
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Done
        </Button>
      </CardContent>
    </Card>
  );
}

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
      {revealed && <RevealedKey apiKey={revealed} onDone={() => setRevealed(null)} />}
      <form action={create} className="flex flex-wrap gap-2">
        <Input
          name="name"
          aria-label="Key name"
          placeholder="Key name, e.g. production"
          maxLength={64}
          required
          className="w-64"
        />
        <Button type="submit" disabled={busy}>
          Create key
        </Button>
      </form>
      {error ? (
        <p className="text-sm text-destructive">Could not load API keys.</p>
      ) : !data ? (
        <Loader />
      ) : (
        <div className="overflow-x-auto border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                {HEADERS.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 && (
                <tr>
                  <td
                    colSpan={HEADERS.length}
                    className="px-3 py-6 text-center text-muted-foreground"
                  >
                    No keys yet.
                  </td>
                </tr>
              )}
              {data.map((k) => (
                <tr key={k.id} className="border-t">
                  <td className="px-3 py-2">{k.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{k.prefix}…</td>
                  <td className="px-3 py-2">{formatTime(k.createdAt)}</td>
                  <td className="px-3 py-2">{k.createdBy}</td>
                  <td className="px-3 py-2">{k.lastUsedAt ? formatTime(k.lastUsedAt) : "never"}</td>
                  <td className="px-3 py-2">
                    {k.revokedAt ? `revoked ${formatTime(k.revokedAt)}` : "active"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!k.revokedAt && (
                      <Button variant="destructive" size="sm" onClick={() => revoke(k.id, k.name)}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
