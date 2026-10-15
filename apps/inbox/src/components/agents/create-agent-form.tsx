"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormError, FormField } from "@/components/auth/form-field";
import { ApiError, api } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { AgentView } from "@/lib/schemas";

const NAME_PATTERN = "[a-z0-9]+(-[a-z0-9]+)*";

function message(error: unknown) {
  if (!(error instanceof ApiError)) return "Could not create the agent.";
  if (error.code === ApiErrorCode.AGENT_NAME_TAKEN)
    return "An agent with that name already exists.";
  if (error.code === ApiErrorCode.AGENT_LIMIT_REACHED) {
    return "Your license's agent limit is reached.";
  }
  if (error.code === ApiErrorCode.VALIDATION_FAILED) return "Check the name and description.";
  return "Could not create the agent.";
}

export function CreateAgentForm({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData) {
    setBusy(true);
    setError(null);
    const description = String(form.get("description") ?? "").trim();
    try {
      const agent = await api(API_ENDPOINTS.AGENTS, AgentView, {
        method: HttpMethod.POST,
        body: { name: form.get("name"), ...(description && { description }) },
      });
      router.push(`/agents/${agent.id}`);
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>
          <Plus />
          Register an agent
        </PanelTitle>
      </PanelHeader>
      <PanelBody>
        <form action={submit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <FormField
              label="Name"
              name="name"
              placeholder="github-assistant"
              pattern={NAME_PATTERN}
              title="kebab-case, e.g. github-assistant"
              maxLength={64}
              required
              autoFocus
              hint="kebab-case; one per application, not per server"
            />
            <FormField
              label="Description"
              name="description"
              placeholder="Triages issues in our public repo"
              maxLength={500}
              hint="Optional"
            />
          </div>
          <FormError>{error}</FormError>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              New agents start with the starter policy: block everything except calls in the signed
              plan.
            </p>
            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              )}
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create agent"}
              </Button>
            </div>
          </div>
        </form>
      </PanelBody>
    </Panel>
  );
}
