"use client";

import { API_ENDPOINTS, Role } from "@intentlock/core";
import { Button } from "@intentlock/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@intentlock/ui/components/card";
import { Input } from "@intentlock/ui/components/input";
import { Textarea } from "@intentlock/ui/components/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@intentlock/ui/components/table";
import { useState } from "react";

import { VerdictBadge } from "@/components/verdict-badge";
import { api } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
import { errorMessage } from "@/lib/error-message";
import {
  type PolicyTestResult,
  PolicyTestResult as PolicyTestResultSchema,
  SampleCalls,
} from "@/lib/schemas";

const DEFAULT_REPLAY = 50;
const HEADERS = ["Tool", "Arguments", "Active policy", "This draft"];

function sampleTemplate(email: string) {
  return JSON.stringify(
    [
      {
        call: { tool: "github_post_comment", args: { repo: "acme/public-app" }, callId: "t1" },
        user: { email, role: Role.enum.member },
        inPlan: true,
      },
    ],
    null,
    2,
  );
}

function parseSamples(text: string) {
  if (!text.trim()) return { calls: [] };
  try {
    const parsed = SampleCalls.safeParse(JSON.parse(text));
    if (parsed.success) return { calls: parsed.data };
    const issue = parsed.error.issues[0];
    return { error: `Sample calls: ${issue?.path.join(".") ?? ""} ${issue?.message ?? "invalid"}` };
  } catch {
    return { error: "Sample calls are not valid JSON." };
  }
}

function Results({ result }: { result: PolicyTestResult }) {
  const rows = [...result.results].sort(
    (a, b) => Number(b.from.verdict !== b.to.verdict) - Number(a.from.verdict !== a.to.verdict),
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3 text-sm">
        {result.changed.length === 0 ? (
          <span className="text-muted-foreground">
            No verdict changes across {result.results.length} calls.
          </span>
        ) : (
          result.changed.map((c) => (
            <span
              key={`${c.from}-${c.to}`}
              className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1"
            >
              <VerdictBadge verdict={c.from} /> → <VerdictBadge verdict={c.to} />
              <span className="tabular-nums">× {c.count}</span>
            </span>
          ))
        )}
      </div>
      {rows.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                {HEADERS.map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => {
                const changed = r.from.verdict !== r.to.verdict;
                return (
                  <TableRow key={i} className={changed ? "bg-warning/8 font-medium" : undefined}>
                    <TableCell className="font-mono text-xs">{r.call.tool}</TableCell>
                    <TableCell
                      label="Arguments"
                      className="max-w-xs truncate font-mono text-xs text-muted-foreground"
                    >
                      {JSON.stringify(r.call.args)}
                    </TableCell>
                    <TableCell label="Active policy">
                      <span className="inline-flex items-center gap-1.5">
                        <VerdictBadge verdict={r.from.verdict} />
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.from.ruleId ?? "default"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell label="This draft">
                      <span className="inline-flex items-center gap-1.5">
                        <VerdictBadge verdict={r.to.verdict} />
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.to.ruleId ?? "default"}
                        </span>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function TestPanel({
  agentId,
  source,
  email,
  disabled,
}: {
  agentId: string;
  source: string;
  email: string;
  disabled: boolean;
}) {
  const [samples, setSamples] = useState(() => sampleTemplate(email));
  const [replay, setReplay] = useState(String(DEFAULT_REPLAY));
  const [result, setResult] = useState<PolicyTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    const parsed = parseSamples(samples);
    if (parsed.error !== undefined) {
      setError(parsed.error);
      return;
    }
    const replayLast = Number(replay);
    setBusy(true);
    setError(null);
    try {
      setResult(
        await api(API_ENDPOINTS.AGENT_POLICY_TEST, PolicyTestResultSchema, {
          method: HttpMethod.POST,
          params: { id: agentId },
          body: {
            source,
            calls: parsed.calls,
            ...(replayLast > 0 && { replayLast: Math.floor(replayLast) }),
          },
        }),
      );
    } catch (e) {
      setResult(null);
      setError(errorMessage(e, "Test failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Test</CardTitle>
        <CardDescription>
          Dry run against the active policy: your sample calls plus the agent&apos;s last decisions.
          Nothing is saved.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea
          aria-label="Sample calls (JSON)"
          value={samples}
          onChange={(e) => setSamples(e.target.value)}
          className="min-h-36 font-mono text-xs"
          spellCheck={false}
        />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="replay">Replay last</label>
          <Input
            id="replay"
            type="number"
            min={0}
            max={500}
            value={replay}
            onChange={(e) => setReplay(e.target.value)}
            className="w-20"
          />
          <span>decisions</span>
          <Button onClick={run} disabled={busy || disabled}>
            {busy ? "Testing…" : "Run test"}
          </Button>
          {disabled && <span className="text-xs text-muted-foreground">Fix the errors first.</span>}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {result && <Results result={result} />}
      </CardContent>
    </Card>
  );
}
