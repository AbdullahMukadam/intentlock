"use client";

import { Button } from "@intentlock/ui/components/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AgentPane } from "@/components/demo/agent-pane";
import { DEMO_RUNNER_HEADER, DEMO_RUNNER_PREFIX } from "@/lib/constants";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { HttpStatus } from "@/lib/enums/http-status.enum";
import { RunMode } from "@/lib/enums/run-mode.enum";
import { RunnerEventKind } from "@/lib/enums/runner-event-kind.enum";
import { addEvent, type RunnerEvent } from "@/lib/runner-events";

const RUNNER_COMMAND = "pnpm --filter @intentlock/demo run runner";

export function DemoView() {
  const [events, setEvents] = useState<RunnerEvent[]>([]);
  const [starting, setStarting] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`${DEMO_RUNNER_PREFIX}/events`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.onmessage = (m: MessageEvent<string>) => {
      try {
        const raw: unknown = JSON.parse(m.data);
        setEvents((prev) => addEvent(prev, raw));
      } catch {
        return;
      }
    };
    return () => source.close();
  }, []);

  async function start() {
    setStarting(true);
    try {
      const res = await fetch(`${DEMO_RUNNER_PREFIX}/runs`, {
        method: HttpMethod.POST,
        headers: { [DEMO_RUNNER_HEADER]: "1" },
      });
      if (res.status === HttpStatus.CONFLICT) toast.info("A run is already in progress.");
      else if (!res.ok) toast.error(`Runner answered ${res.status}.`);
    } catch {
      toast.error(`Runner not reachable. Start it with: ${RUNNER_COMMAND}`);
    }
    setStarting(false);
  }

  const forced = events.some((e) => e.kind === RunnerEventKind.STARTED && e.forced);
  const task = events.find((e) => e.kind === RunnerEventKind.STARTED);
  const of = (mode: RunMode) => events.filter((e) => e.mode === mode);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Demo: github-assistant</h1>
          <p className="text-sm text-muted-foreground">
            The same agent, task and poisoned issue, without and with Intentlock.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {connected ? "Runner connected" : `Runner offline: ${RUNNER_COMMAND}`}
          </span>
          <Button onClick={start} disabled={!connected} loading={starting}>
            Run both
          </Button>
        </div>
      </div>
      {forced && (
        <p role="note" className="border border-dashed p-2 text-sm">
          Forced-attack mode: a scripted model (FakeProvider) emits the injected tool calls. The
          gate, policy and tools are the real ones.
        </p>
      )}
      {task?.kind === RunnerEventKind.STARTED && (
        <p className="text-sm">
          <span className="text-muted-foreground">Task: </span>
          {task.task}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <AgentPane
          title="Without Intentlock"
          description="PassThroughGate: every tool call runs."
          events={of(RunMode.UNPROTECTED)}
        />
        <AgentPane
          title="With Intentlock"
          description="Signed plan + policy: off-plan and private-repo calls are blocked, comments held."
          events={of(RunMode.PROTECTED)}
        />
      </div>
    </div>
  );
}
