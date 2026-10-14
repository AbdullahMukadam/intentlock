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
import { useState } from "react";

import { VerdictBadge } from "@/components/verdict-badge";
import { ApiError, api } from "@/lib/api";
import { HttpMethod } from "@/lib/enums/http-method.enum";
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
              className="inline-flex items-center gap-1 border px-2 py-0.5"
            >
              <VerdictBadge verdict={c.from} /> → <VerdictBadge verdict={c.to} />
              <span className="tabular-nums">× {c.count}</span>
            </span>
          ))
        )}
      </div>
      {rows.length > 0 && (
        <div className="max-h-80 overflow-auto border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                {HEADERS.map((h) => (
                  <th key={h} className="px-2 py-1.5 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const changed = r.from.verdict !== r.to.verdict;
                return (
                  <tr key={i} className={changed ? "border-t bg-muted/60 font-medium" : "border-t"}>
                    <td className="px-2 py-1.5 font-mono">{r.call.tool}</td>
                    <td className="max-w-xs truncate px-2 py-1.5 font-mono">
                      {JSON.stringify(r.call.args)}
                    </td>
                    <td className="px-2 py-1.5">
                      <VerdictBadge verdict={r.from.verdict} />{" "}
                      <span className="font-mono text-muted-foreground">
                        {r.from.ruleId ?? "default"}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <VerdictBadge verdict={r.to.verdict} />{" "}
                      <span className="font-mono text-muted-foreground">
                        {r.to.ruleId ?? "default"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
      setError(e instanceof ApiError ? `Test failed: ${e.code}` : "Test failed.");
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
