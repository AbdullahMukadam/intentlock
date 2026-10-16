import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import {
  API_ENDPOINTS,
  type ApiEndpoint,
  apiPath,
  type PlanInput,
  ReportOutcome,
  Role,
  Verdict,
} from "@intentlock/core";
import { HoldStatus, HttpGate, HybridGate, type SignedPlan } from "@intentlock/sdk";

const LB = "http://127.0.0.1:8090/api";
const A = "http://127.0.0.1:3101";
const B = "http://127.0.0.1:3102";
const COMPOSE_FILE = join(import.meta.dirname, "..", "docker-compose.scale.yml");
const KEEP = process.argv.includes("--keep");

const PLANS = 50;
const LIMIT = 5;
const BURST = 20;
const LOAD_SECONDS = 60;
const KILL_AT_SECONDS = 30;
const REMOTE_WORKERS = Number(process.env.REMOTE_WORKERS ?? 16);
const HYBRID_CLIENTS = Number(process.env.HYBRID_CLIENTS ?? 8);
const HYBRID_PAUSE_MS = Number(process.env.HYBRID_PAUSE_MS ?? 20);
const HOLDS = 20;
const RACES = 10;

const ADMIN = { email: "admin@scale.test", password: "correct-horse-battery-staple-42" };
const MEMBER = { email: "member@scale.test", password: "tired-otter-lantern-river-77" };
const POLICY = `version: 1
default: block
rules:
  - id: hold-deploy
    match: { tool: deploy }
    decision: hold
    approvers: { roles: [admin] }
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const SIGNING_KEY = generateKeyPairSync("ed25519")
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

type Sample = { label: string; ms: number; status: number; upstream: string; at: number };
const samples: Sample[] = [];
const failures: string[] = [];
let callSeq = 0;
const nextCallId = () => `c${++callSeq}`;

function compose(...args: string[]): string {
  return execFileSync("docker", ["compose", "-f", COMPOSE_FILE, ...args], {
    encoding: "utf8",
    env: { ...process.env, SIGNING_KEY },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function sql(query: string): string {
  return compose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "intentlock",
    "-d",
    "intentlock",
    "-At",
    "-c",
    query,
  ).trim();
}

function labelOf(url: string): string {
  return new URL(url).pathname
    .replace(/^\/api/, "")
    .replace(/^\/v1\/holds\/[^/]+/, "/v1/holds/:id")
    .replace(/^\/v1\/plans\/[^/]+\/refresh/, "/v1/plans/:id/refresh");
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

const timedFetch: typeof fetch = async (input, init) => {
  const label = labelOf(urlOf(input));
  const start = performance.now();
  try {
    const res = await fetch(input, init);
    samples.push({
      label,
      ms: performance.now() - start,
      status: res.status,
      upstream: res.headers.get("x-upstream") ?? "",
      at: Date.now(),
    });
    return res;
  } catch (err) {
    samples.push({ label, ms: performance.now() - start, status: 0, upstream: "", at: Date.now() });
    throw err;
  }
};

async function api<T>(
  base: string,
  method: string,
  endpoint: ApiEndpoint,
  opts: { params?: Record<string, string>; body?: unknown; cookie?: string } = {},
): Promise<{ status: number; data: T; cookie: string }> {
  const res = await timedFetch(base + apiPath(endpoint, opts.params), {
    method,
    headers: {
      cookie: opts.cookie ?? "",
      "x-intentlock-csrf": "1",
      ...(opts.body !== undefined && { "content-type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? opts.cookie ?? "";
  return { status: res.status, data: (text ? JSON.parse(text) : undefined) as T, cookie };
}

async function must<T>(...args: Parameters<typeof api>): Promise<T> {
  const res = await api<T>(...args);
  if (res.status >= 300)
    throw new Error(`${args[1]} ${args[2]} → ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
}

function check(ok: boolean, message: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${message}`);
  if (!ok) failures.push(message);
}

async function waitReady() {
  const deadline = Date.now() + 180_000;
  for (const url of [`${A}/health/ready`, `${B}/health/ready`, `${LB}/health/ready`]) {
    while (
      !(await fetch(url).then(
        (r) => r.ok,
        () => false,
      ))
    ) {
      if (Date.now() > deadline) throw new Error(`${url} never became ready`);
      await sleep(1000);
    }
  }
}

async function setUp() {
  const codes = [...compose("logs", "server-1", "server-2").matchAll(/setup code: ([\w-]+)/g)].map(
    (m) => m[1] ?? "",
  );
  let setupDone = false;
  for (const code of codes.reverse()) {
    const res = await api(LB, "POST", API_ENDPOINTS.SETUP, { body: { code, ...ADMIN } });
    if (res.status === 201) {
      setupDone = true;
      break;
    }
  }
  if (!setupDone) throw new Error(`no working setup code among ${codes.length}`);

  const login = await api(LB, "POST", API_ENDPOINTS.AUTH_LOGIN, { body: ADMIN });
  const cookie = login.cookie;
  const invite = await must<{ link: string }>(LB, "POST", API_ENDPOINTS.INVITES, {
    cookie,
    body: { email: MEMBER.email, role: Role.enum.member },
  });
  await must(LB, "POST", API_ENDPOINTS.INVITE_ACCEPT, {
    body: { token: invite.link.split("/").pop(), password: MEMBER.password },
  });
  const agent = await must<{ id: string }>(LB, "POST", API_ENDPOINTS.AGENTS, {
    cookie,
    body: { name: "scale-agent", description: "Scale test" },
  });
  const params = { id: agent.id };
  const { active } = await must<{ active: { version: number } }>(
    LB,
    "GET",
    API_ENDPOINTS.AGENT_POLICY,
    { cookie, params },
  );
  await must(LB, "POST", API_ENDPOINTS.AGENT_POLICY_PUBLISH, {
    cookie,
    params,
    body: { source: POLICY, baseVersion: active.version, message: "scale test" },
  });
  const { key } = await must<{ key: string }>(LB, "POST", API_ENDPOINTS.AGENT_API_KEYS, {
    cookie,
    params,
    body: { name: "scale" },
  });
  return { cookie, apiKey: key };
}

function planInput(goal: string): PlanInput {
  return {
    version: 1,
    goal,
    user: MEMBER.email,
    steps: [
      { tool: "read_item", maxCalls: 1_000_000 },
      { tool: "limited", maxCalls: LIMIT },
      { tool: "deploy", maxCalls: 1_000 },
    ],
  };
}

async function counterBurst(plans: SignedPlan[], gateA: HttpGate, gateB: HttpGate) {
  const allowed: number[] = [];
  let errors = 0;
  for (const p of plans) {
    const results = await Promise.allSettled(
      Array.from({ length: BURST }, (_, i) =>
        (i % 2 ? gateB : gateA).check(p.token, {
          tool: "limited",
          args: {},
          callId: nextCallId(),
        }),
      ),
    );
    errors += results.filter((r) => r.status === "rejected").length;
    allowed.push(
      results.filter((r) => r.status === "fulfilled" && r.value.verdict === Verdict.ALLOW).length,
    );
  }
  check(
    errors === 0 && allowed.every((n) => n === LIMIT),
    `counter: ${PLANS} plans, each ${BURST} concurrent checks split across A and B → exactly ${LIMIT} allowed per plan (got ${[...new Set(allowed)].join(", ")}; ${errors} errors)`,
  );
}

async function holdsAcrossInstances(plan: SignedPlan, gateA: HttpGate, cookie: string) {
  let approved = 0;
  let errors = 0;
  for (let i = 0; i < HOLDS; i++) {
    try {
      const d = await gateA.check(plan.token, {
        tool: "deploy",
        args: { n: i },
        callId: nextCallId(),
      });
      if (d.verdict !== Verdict.HOLD) continue;
      const outcome = gateA.waitForHold(d.holdId, { timeoutMs: 30_000 });
      await must(B, "POST", API_ENDPOINTS.HOLD_APPROVE, {
        cookie,
        params: { id: d.holdId },
        body: {},
      });
      if ((await outcome) === HoldStatus.APPROVED) approved++;
    } catch {
      errors++;
    }
  }
  check(
    approved === HOLDS,
    `holds: ${approved}/${HOLDS} created on A, approved on B, seen as approved by a long-poll on A (${errors} errors)`,
  );

  let singleWinner = 0;
  errors = 0;
  for (let i = 0; i < RACES; i++) {
    try {
      const d = await gateA.check(plan.token, {
        tool: "deploy",
        args: { race: i },
        callId: nextCallId(),
      });
      if (d.verdict !== Verdict.HOLD) continue;
      const params = { id: d.holdId };
      const results = await Promise.all([
        api(A, "POST", API_ENDPOINTS.HOLD_APPROVE, { cookie, params, body: {} }),
        api(B, "POST", API_ENDPOINTS.HOLD_REJECT, { cookie, params, body: {} }),
      ]);
      const statuses = results.map((r) => r.status).sort();
      if (statuses[0]! < 300 && statuses[1] === 409) singleWinner++;
    } catch {
      errors++;
    }
  }
  check(
    singleWinner === RACES,
    `hold races: ${singleWinner}/${RACES} approve-on-A vs reject-on-B had exactly one winner and one 409 (${errors} errors)`,
  );
}

type Counts = { ok: number; errors: number; errorsAfterKill: number };

async function remoteWorker(
  plans: SignedPlan[],
  gate: HttpGate,
  until: number,
  killAt: () => number | null,
  counts: Counts,
) {
  for (let i = 0; Date.now() < until; i++) {
    const plan = plans[i % plans.length]!;
    const callId = nextCallId();
    try {
      const d = await gate.check(plan.token, { tool: "read_item", args: { i }, callId });
      if (d.verdict === Verdict.ALLOW) await gate.report(plan.token, callId, ReportOutcome.OK);
      counts.ok++;
    } catch {
      counts.errors++;
      if (killAt() !== null) counts.errorsAfterKill++;
      await sleep(50);
    }
  }
}

type HybridStats = { planId: string; checks: number; reports: number; blocked: number };

async function hybridClient(
  apiKey: string,
  until: number,
  errors: { count: number },
): Promise<HybridStats> {
  const gate = new HybridGate({
    baseUrl: LB,
    apiKey,
    outboxDir: null,
    flushIntervalMs: 1_000,
    handleSignals: false,
    fetch: timedFetch,
    onError: () => errors.count++,
  });
  const plan = await gate.signPlan(planInput("hybrid client"));
  const stats: HybridStats = { planId: plan.planId, checks: 0, reports: 0, blocked: 0 };
  for (let i = 0; Date.now() < until; i++) {
    const callId = nextCallId();
    const d = await gate.check(plan.token, { tool: "read_item", args: { i }, callId });
    stats.checks++;
    if (d.verdict === Verdict.ALLOW) {
      await gate.report(plan.token, callId, ReportOutcome.OK);
      stats.reports++;
    } else stats.blocked++;
    await sleep(HYBRID_PAUSE_MS);
  }
  await gate.close();
  return stats;
}

function percentile(sorted: number[], p: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! : 0;
}

function report(from: number, to: number) {
  const window = samples.filter((s) => s.at >= from && s.at <= to);
  const seconds = (to - from) / 1000;
  const labels = [...new Set(window.map((s) => s.label))].sort();
  console.log(`\n| Endpoint | Requests | req/s | p50 ms | p95 ms | Errors (5xx / network) |`);
  console.log(`| --- | --- | --- | --- | --- | --- |`);
  for (const label of labels) {
    const rows = window.filter((s) => s.label === label);
    const ms = rows.map((s) => s.ms).sort((x, y) => x - y);
    const errors = rows.filter((s) => s.status === 0 || s.status >= 500).length;
    console.log(
      `| \`${label}\` | ${rows.length} | ${(rows.length / seconds).toFixed(1)} | ${percentile(ms, 0.5).toFixed(1)} | ${percentile(ms, 0.95).toFixed(1)} | ${errors} |`,
    );
  }
  const all = window.map((s) => s.ms).sort((x, y) => x - y);
  console.log(
    `| **all** | ${window.length} | ${(window.length / seconds).toFixed(1)} | ${percentile(all, 0.5).toFixed(1)} | ${percentile(all, 0.95).toFixed(1)} | ${window.filter((s) => s.status === 0 || s.status >= 500).length} |`,
  );
}

async function main() {
  console.log("starting a fresh scale stack (2 servers + nginx + Postgres + inbox)");
  compose("down", "-v");
  compose("up", "-d", "--build");
  await waitReady();
  const { cookie, apiKey } = await setUp();

  const lb = new HttpGate({ baseUrl: LB, apiKey, fetch: timedFetch });
  const gateA = new HttpGate({ baseUrl: A, apiKey, fetch: timedFetch });
  const gateB = new HttpGate({ baseUrl: B, apiKey, fetch: timedFetch });

  const signStart = Date.now();
  const plans = await Promise.all(
    Array.from({ length: PLANS }, (_, i) => lb.signPlan(planInput(`plan ${i}`))),
  );
  const signMs = Date.now() - signStart;
  const upstreams = new Set(
    samples.filter((s) => s.label === API_ENDPOINTS.PLANS).map((s) => s.upstream),
  );
  check(
    upstreams.size === 2,
    `sign: ${PLANS} plans signed concurrently in ${signMs} ms, spread over ${upstreams.size} instances`,
  );

  await counterBurst(plans, gateA, gateB);

  const holdPlan = await gateA.signPlan(planInput("holds"));
  const loadStart = Date.now();
  const until = loadStart + LOAD_SECONDS * 1000;
  let killAt: number | null = null;
  const remote: Counts = { ok: 0, errors: 0, errorsAfterKill: 0 };
  const hybridErrors = { count: 0 };

  const killer = (async () => {
    await sleep(KILL_AT_SECONDS * 1000);
    compose("kill", "server-2");
    killAt = Date.now();
    console.log(`killed server-2 at +${KILL_AT_SECONDS}s`);
  })();
  const [, , hybrid] = await Promise.all([
    holdsAcrossInstances(holdPlan, gateA, cookie),
    Promise.all(
      Array.from({ length: REMOTE_WORKERS }, () =>
        remoteWorker(plans, lb, until, () => killAt, remote),
      ),
    ),
    Promise.all(
      Array.from({ length: HYBRID_CLIENTS }, () => hybridClient(apiKey, until, hybridErrors)),
    ),
    killer,
  ]);
  const loadEnd = Date.now();

  const afterKill = samples.filter(
    (s) => killAt !== null && s.at > killAt && s.label === API_ENDPOINTS.CHECK,
  );
  const firstOk = afterKill.find((s) => s.status === 200);
  const okAfterKill = afterKill.filter((s) => s.status === 200).length;
  check(
    okAfterKill > 0,
    `failover: ${okAfterKill} remote checks succeeded through nginx after the kill (first after ${firstOk && killAt ? firstOk.at - killAt : "-"} ms); ${remote.errorsAfterKill} client errors after the kill, ${remote.errors} in total`,
  );

  const verify = await must<{ ok: boolean; count: number; flagged?: number }>(
    LB,
    "GET",
    API_ENDPOINTS.AUDIT_VERIFY,
    { cookie },
  );
  check(verify.ok, `audit chain intact: ${verify.count} entries, flagged ${verify.flagged ?? 0}`);
  check(
    sql(
      `SELECT count(*) FROM (SELECT 1 FROM "AuditEntry" WHERE "clientSeq" IS NOT NULL GROUP BY "planId", "clientSeq" HAVING count(*) > 1) d`,
    ) === "0",
    "no duplicate (planId, clientSeq)",
  );
  const ids = hybrid.map((h) => `'${h.planId}'`).join(",");
  const delivered = new Map(
    sql(
      `SELECT "planId", count(*), max("clientSeq") - min("clientSeq") + 1 FROM "AuditEntry" WHERE "planId" IN (${ids}) AND "clientSeq" IS NOT NULL GROUP BY "planId"`,
    )
      .split("\n")
      .map((line) => line.split("|"))
      .map(([planId, count, span]) => [planId, { count: Number(count), span: Number(span) }]),
  );
  const complete = hybrid.filter((h) => {
    const d = delivered.get(h.planId);
    return d !== undefined && d.count === h.checks + h.reports && d.span === d.count;
  });
  const decisions = hybrid.reduce((n, h) => n + h.checks, 0);
  check(
    complete.length === HYBRID_CLIENTS,
    `hybrid: ${complete.length}/${HYBRID_CLIENTS} clients' outboxes fully delivered with no gaps (${decisions} local decisions, ${hybrid.reduce((n, h) => n + h.blocked, 0)} blocked by backpressure, ${hybridErrors.count} upload errors retried)`,
  );
  const overLimit = sql(
    `SELECT count(*) FROM "StepUsage" su JOIN "Plan" p ON p.id = su."planId" WHERE su.calls > (p.body->'steps'->su.step->>'maxCalls')::int`,
  );
  const usageRows = sql(`SELECT count(*) FROM "StepUsage"`);
  check(overLimit === "0", `no counter exceeded maxCalls (${usageRows} step counters checked)`);
  const badHolds = sql(
    `SELECT count(*) FROM "Hold" h WHERE h.status = 'PENDING' OR (SELECT count(*) FROM "AuditEntry" a WHERE a.kind = 'hold_resolved' AND a.payload->>'holdId' = h.id) <> 1`,
  );
  const holdStates = sql(
    `SELECT status || ' ' || count(*) FROM "Hold" GROUP BY status ORDER BY status`,
  ).replace(/\n/g, ", ");
  check(
    badHolds === "0",
    `every hold ended in exactly one state with one resolution entry (${holdStates})`,
  );

  console.log(
    `\nLoad phase: ${((loadEnd - loadStart) / 1000).toFixed(1)} s, ${REMOTE_WORKERS} remote workers, ${HYBRID_CLIENTS} hybrid clients, server-2 killed at +${KILL_AT_SECONDS}s`,
  );
  report(loadStart, loadEnd);

  if (KEEP)
    console.log(
      `\nstack left running; stop it with: docker compose -f deploy/docker-compose.scale.yml down -v`,
    );
  else compose("down", "-v");
  console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall checks passed");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
