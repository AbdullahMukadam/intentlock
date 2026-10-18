"use client";

import { API_ENDPOINTS } from "@intentlock/core";
import { Button, buttonVariants } from "@intentlock/ui/components/button";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@intentlock/ui/components/panel";
import { cn } from "@intentlock/ui/lib/utils";
import { ArrowRight, Check, Loader2, Rocket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { useMe } from "@/components/app-shell";
import { FormError, FormField } from "@/components/auth/form-field";
import { CodeBlock } from "@/components/code-block";
import { PageHeader } from "@/components/page-header";
import { SecretReveal } from "@/components/secret-reveal";
import { VerdictBadge } from "@/components/verdict-badge";
import { api, apiUrl } from "@/lib/api";
import { ApiErrorCode } from "@/lib/enums/api-error-code.enum";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { OnboardingStep } from "@/lib/enums/onboarding-step.enum";
import { errorMessage } from "@/lib/error-message";
import { AgentView, AuditPage, NewApiKey } from "@/lib/schemas";
import { useApi } from "@/lib/use-api";

const STEPS: { id: OnboardingStep; title: string; hint: string }[] = [
  { id: OnboardingStep.AGENT, title: "Register an agent", hint: "One per AI application" },
  { id: OnboardingStep.KEY, title: "Create an API key", hint: "Shown once" },
  { id: OnboardingStep.CONNECT, title: "Connect your app", hint: "Two env vars, five lines" },
  { id: OnboardingStep.DECISION, title: "First decision", hint: "We'll wait for it here" },
];

const POLL_MS = 3_000;

function Stepper({ current }: { current: OnboardingStep }) {
  const index = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="grid gap-1 sm:grid-cols-4">
      {STEPS.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li
            key={s.id}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-transparent p-2.5",
              active && "border-border bg-card shadow-xs",
            )}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-success/30 bg-success/10 text-success",
                active && "border-primary bg-primary text-primary-foreground",
                !done && !active && "bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={cn(
                  "block truncate text-[13px] font-medium",
                  !active && !done && "text-muted-foreground",
                )}
              >
                {s.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{s.hint}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function agentMessage(error: unknown) {
  return errorMessage(error, "Could not create the agent.", {
    [ApiErrorCode.VALIDATION_FAILED]: "Use kebab-case, e.g. github-assistant.",
  });
}

function snippet(user: string) {
  return `import { HybridGate } from "@intentlock/sdk";

const gate = new HybridGate({ baseUrl: process.env.INTENTLOCK_URL!, apiKey: process.env.INTENTLOCK_API_KEY! });
const { token } = await gate.signPlan({ version: 1, goal: "Say hello", user: "${user}", steps: [{ tool: "say_hello" }] });
console.log(await gate.check(token, { tool: "say_hello", args: {}, callId: "1" }));
await gate.close();`;
}

function WaitForDecision({ agentId }: { agentId: string }) {
  const { data } = useApi(
    apiUrl(API_ENDPOINTS.AUDIT, { query: { agentId, limit: 5 } }),
    AuditPage,
    { refetchInterval: POLL_MS },
  );
  const decision = data?.entries.find((e) => e.verdict);

  if (!decision) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <p className="text-sm font-medium">Waiting for your agent's first decision…</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          Run the snippet from the previous step. This page updates on its own as soon as the server
          sees a plan or a check.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 p-1">
      <div className="flex items-start gap-3 rounded-lg border border-success/25 bg-success/8 p-4">
        <Check className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="grid gap-1.5">
          <p className="text-sm font-medium">Your agent is connected.</p>
          <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span className="font-mono text-xs text-foreground">{decision.tool}</span>
            <VerdictBadge verdict={decision.verdict} />
            {decision.ruleId && <span className="font-mono text-xs">{decision.ruleId}</span>}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {decision.planId && (
          <Link href={`/runs/${decision.planId}`} className={buttonVariants()}>
            Open the run <ArrowRight />
          </Link>
        )}
        <Link href="/team" className={buttonVariants({ variant: "outline" })}>
          Invite your team
        </Link>
        <Link href="/" className={buttonVariants({ variant: "ghost" })}>
          Go to the dashboard
        </Link>
      </div>
    </div>
  );
}

export function OnboardingWizard() {
  const me = useMe();
  const [step, setStep] = useState(OnboardingStep.AGENT);
  const [agent, setAgent] = useState<AgentView | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAgent(form: FormData) {
    setBusy(true);
    setError(null);
    const description = String(form.get("description") ?? "").trim();
    try {
      const created = await api(API_ENDPOINTS.AGENTS, AgentView, {
        method: HttpMethod.POST,
        body: { name: form.get("name"), ...(description && { description }) },
      });
      setAgent(created);
      setStep(OnboardingStep.KEY);
    } catch (e) {
      setError(agentMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function createKey(form: FormData) {
    if (!agent) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api(API_ENDPOINTS.AGENT_API_KEYS, NewApiKey, {
        method: HttpMethod.POST,
        params: { id: agent.id },
        body: { name: form.get("name") },
      });
      setApiKey(created.key);
    } catch (e) {
      setError(errorMessage(e, "Could not create the key."));
    } finally {
      setBusy(false);
    }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const env = `INTENTLOCK_URL=${origin}/api\nINTENTLOCK_API_KEY=${apiKey ?? "il_live_…"}`;

  return (
    <div className="grid gap-8">
      <PageHeader
        title="Connect your first agent"
        description="Four steps from an empty install to a checked tool call. You can leave at any time and finish later from the Agents page."
        actions={
          <Link href="/" className={buttonVariants({ variant: "ghost" })}>
            Skip for now
          </Link>
        }
      />
      <Panel>
        <PanelBody className="border-0 bg-transparent p-1 shadow-none">
          <Stepper current={step} />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader>
          <PanelTitle>
            <Rocket />
            {STEPS.find((s) => s.id === step)?.title}
          </PanelTitle>
        </PanelHeader>
        <PanelBody>
          {step === OnboardingStep.AGENT && (
            <form action={createAgent} className="grid max-w-2xl gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  label="Agent name"
                  name="name"
                  placeholder="github-assistant"
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  title="kebab-case, e.g. github-assistant"
                  maxLength={64}
                  required
                  autoFocus
                  hint="kebab-case; one per application"
                />
                <FormField
                  label="Description"
                  name="description"
                  placeholder="Triages issues in our public repo"
                  maxLength={500}
                  hint="Optional"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                It starts with the starter policy: everything is blocked except the calls in the
                plan your agent declares.
              </p>
              <FormError>{error}</FormError>
              <div>
                <Button type="submit" loading={busy}>
                  {busy ? "Creating…" : "Create agent"} <ArrowRight />
                </Button>
              </div>
            </form>
          )}
          {step === OnboardingStep.KEY && agent && (
            <div className="grid max-w-2xl gap-4">
              {apiKey ? (
                <SecretReveal
                  title={`API key for ${agent.name}`}
                  description="Copy it now: it is shown once and only its hash is stored."
                  secret={apiKey}
                  onDone={() => setStep(OnboardingStep.CONNECT)}
                />
              ) : (
                <form action={createKey} className="grid gap-4">
                  <FormField
                    label="Key name"
                    name="name"
                    defaultValue="production"
                    maxLength={64}
                    required
                    hint="Where this key will run, e.g. production, staging or your laptop"
                  />
                  <FormError>{error}</FormError>
                  <div>
                    <Button type="submit" loading={busy}>
                      {busy ? "Creating…" : "Create key"} <ArrowRight />
                    </Button>
                  </div>
                </form>
              )}
              {apiKey && (
                <div>
                  <Button onClick={() => setStep(OnboardingStep.CONNECT)}>
                    I've copied it <ArrowRight />
                  </Button>
                </div>
              )}
            </div>
          )}
          {step === OnboardingStep.CONNECT && (
            <div className="grid gap-4">
              <p className="text-[13px] text-muted-foreground">
                Install <code className="font-mono text-xs">@intentlock/sdk</code> in your agent
                app, put these two variables in its environment, then run the snippet. It signs a
                one-step plan and checks one call against it.
              </p>
              <CodeBlock label=".env" code={env} />
              <CodeBlock label="hello-intentlock.ts" code={snippet(me.email)} />
              <div>
                <Button onClick={() => setStep(OnboardingStep.DECISION)}>
                  I've run it <ArrowRight />
                </Button>
              </div>
            </div>
          )}
          {step === OnboardingStep.DECISION && agent && <WaitForDecision agentId={agent.id} />}
        </PanelBody>
      </Panel>
    </div>
  );
}
