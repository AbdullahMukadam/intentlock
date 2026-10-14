import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@intentlock/ui/components/card";

import { EventRow } from "@/components/demo/event-row";
import { RunnerEventKind } from "@/lib/enums/runner-event-kind.enum";
import type { RunnerEvent } from "@/lib/runner-events";

export function AgentPane({
  title,
  description,
  events,
}: {
  title: string;
  description: string;
  events: RunnerEvent[];
}) {
  const end = events.find(
    (e) => e.kind === RunnerEventKind.FINISHED || e.kind === RunnerEventKind.FAILED,
  );
  const started = events.some((e) => e.kind === RunnerEventKind.STARTED);
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!started ? (
          <p className="text-sm text-muted-foreground">Waiting for a run.</p>
        ) : (
          <ul aria-live="polite">
            {events.flatMap((e) =>
              e.kind === RunnerEventKind.GUARD ? [<EventRow key={e.seq} event={e.event} />] : [],
            )}
          </ul>
        )}
        {started && !end && <p className="text-xs text-muted-foreground">Running…</p>}
        {end?.kind === RunnerEventKind.FINISHED && (
          <div className="grid gap-1 border-t pt-3 text-sm">
            <span className="text-xs text-muted-foreground">
              Agent&apos;s answer ({end.status})
            </span>
            <p>{end.text ?? "—"}</p>
          </div>
        )}
        {end?.kind === RunnerEventKind.FAILED && (
          <p role="alert" className="border-t pt-3 text-sm text-destructive">
            Run failed: {end.reason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
