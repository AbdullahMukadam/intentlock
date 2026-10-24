"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Webhook } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { SecretReveal } from "@/components/secret-reveal";
import { api } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import { type AgentView, NewWebhook } from "@/lib/schemas";

export function WebhookPanel({ agent, onChange }: { agent: AgentView; onChange: () => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function save(form: FormData) {
    setBusy(true);
    try {
      const saved = await api(API_ENDPOINTS.AGENT_WEBHOOK, NewWebhook, {
        method: HttpMethod.PUT,
        params: { id: agent.id },
        body: { url: form.get("url") },
      });
      setSecret(saved.secret);
      onChange();
    } catch (e) {
      toast.error(errorMessage(e, "Could not save the webhook."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await api(API_ENDPOINTS.AGENT_WEBHOOK, z.undefined(), {
        method: HttpMethod.DELETE,
        params: { id: agent.id },
      });
      toast.success("Webhook removed");
      onChange();
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove the webhook."));
    }
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Webhook />
          Hold webhook
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          When a hold for this agent is approved, rejected or expires, Intentlock posts a signed
          event to this URL, so a paused run can resume. Failed deliveries are retried for about
          four hours.
        </p>
        {secret && (
          <SecretReveal
            title="Copy the signing secret now"
            description="It is shown once. Verify each event's intentlock-signature header with it (verifyWebhook in @intentlock/core). Saving the URL again makes a new secret."
            secret={secret}
            onDone={() => setSecret(null)}
          />
        )}
        <form action={save} className="flex flex-wrap gap-2">
          <Input
            key={agent.webhookUrl ?? ""}
            name="url"
            type="url"
            aria-label="Webhook URL"
            placeholder="https://example.com/hooks/intentlock"
            defaultValue={agent.webhookUrl ?? ""}
            maxLength={2000}
            required
            className="h-8 min-w-0 flex-1 basis-64"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>
              {agent.webhookUrl ? "Save and new secret" : "Save"}
            </Button>
            {agent.webhookUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmRemove(true)}
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </PanelBody>
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remove the hold webhook?"
        description="Paused runs of this agent will no longer be told when their holds are resolved. Events not yet delivered are dropped."
        confirmLabel="Remove webhook"
        onConfirm={remove}
      />
    </Panel>
  );
}
