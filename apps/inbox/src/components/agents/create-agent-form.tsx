"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import { Input } from "@intentlock/ui/components/input";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

export function CreateAgentForm() {
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
    <form action={submit} className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Input
          name="name"
          aria-label="Agent name"
          placeholder="github-assistant"
          pattern={NAME_PATTERN}
          title="kebab-case, e.g. github-assistant"
          maxLength={64}
          required
          className="w-56"
        />
        <Input
          name="description"
          aria-label="Description"
          placeholder="Description (optional)"
          maxLength={500}
          className="w-80"
        />
        <Button type="submit" disabled={busy}>
          New agent
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        New agents start with the starter policy: block everything except calls in the signed plan.
      </p>
    </form>
  );
}
