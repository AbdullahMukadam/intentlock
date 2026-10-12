import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { ClientEntry, hashClientEntry, ReportOutcome, Verdict } from "@intentlock/core";
import { HttpGate, HybridGate, type HybridGateOptions } from "@intentlock/sdk";
import request from "supertest";

import { AuditFlag } from "../src/audit/enums/audit-flag.enum.js";
import { AuditKind } from "../src/audit/enums/audit-kind.enum.js";
import { AuditOrigin } from "../src/audit/enums/audit-origin.enum.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  CSRF,
  planFor,
  publish,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const POLICY = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
    timeoutSeconds: 2
  - id: no-other-repos
    match: { tool: "github_*", args: { repo: { notGlob: "acme/app" } } }
    decision: block
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const STEPS = [
  { tool: "github_list_issues", args: { repo: { glob: "acme/*" } }, required: true },
  { tool: "github_post_comment", args: { repo: { eq: "acme/app" } } },
];

const CALLS = () => [
  call("github_list_issues", { repo: "acme/app" }),
  call("github_list_issues", { repo: "acme/private" }),
  call("github_create_pull_request", { repo: "acme/app" }),
  call("github_post_comment", { repo: "acme/app" }),
];

const prisma = testPrisma();
let app: INestApplication;
let baseUrl: string;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let approver: Awaited<ReturnType<typeof signedIn>>;
let user: string;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;

beforeAll(async () => {
  app = await createTestApp();
  await app.listen(0);
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  approver = await signedIn(prisma, orgId, UserRole.APPROVER);
  user = (await signedIn(prisma, orgId, UserRole.MEMBER)).user.email;
  bot = await createAgentWithKey(prisma, orgId);
  await publish(app, bot.agent.id, admin.cookie, POLICY);
});

const outboxDir = () => mkdtemp(join(tmpdir(), "intentlock-hybrid-"));

function switchableFetch() {
  const state = { down: false };
  const impl = ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    state.down
      ? Promise.reject(new TypeError("fetch failed"))
      : fetch(input, init)) as typeof fetch;
  return { state, fetch: impl };
}

function hybrid(opts: Partial<HybridGateOptions> = {}) {
  return new HybridGate({
    baseUrl,
    apiKey: bot.key,
    outboxDir: null,
    flushIntervalMs: 60_000,
    handleSignals: false,
    ...opts,
  });
}

const remote = () => new HttpGate({ baseUrl, apiKey: bot.key });
const clientEntries = () =>
  prisma.auditEntry.findMany({ where: { origin: AuditOrigin.CLIENT }, orderBy: { seq: "asc" } });

async function linesOf(dir: string, planId: string): Promise<ClientEntry[]> {
  const text = await readFile(join(dir, `${planId}.jsonl`), "utf8");
  return text
    .trim()
    .split("\n")
    .map((l) => ClientEntry.parse(JSON.parse(l)));
}

async function writeLines(dir: string, planId: string, lines: ClientEntry[]) {
  await writeFile(
    join(dir, `${planId}.jsonl`),
    lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
  );
}

describe("HttpGate (remote mode)", () => {
  it("plan → allow → report, off-plan and policy blocks", async () => {
    const gate = remote();
    const signed = await gate.signPlan(planFor(user, STEPS));
    const [ok, wrongRepo, offPlan] = CALLS();
    expect(await gate.check(signed.token, ok!)).toMatchObject({ verdict: "allow" });
    expect(await gate.check(signed.token, wrongRepo!)).toMatchObject({
      verdict: "block",
      ruleId: "no-other-repos",
    });
    expect(await gate.check(signed.token, offPlan!)).toMatchObject({
      verdict: "block",
      reason: "not_in_plan",
    });
    await gate.report(signed.token, ok!.callId, ReportOutcome.OK);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: signed.planId } })).status).toBe(
      "COMPLETED",
    );
  });

  it("hold → approve → waitForHold returns approved; an unanswered hold expires", async () => {
    const gate = remote();
    const signed = await gate.signPlan(planFor(user, STEPS));
    const held = await gate.check(signed.token, call("github_post_comment", { repo: "acme/app" }));
    if (held.verdict !== "hold") throw new Error("expected a hold");
    const waiting = gate.waitForHold(held.holdId, { timeoutMs: 10_000 });
    await request(app.getHttpServer())
      .post(`/v1/holds/${held.holdId}/approve`)
      .set("Cookie", approver.cookie)
      .set(CSRF)
      .send({})
      .expect(200);
    expect(await waiting).toBe("approved");

    const lonely = await gate.check(
      signed.token,
      call("github_post_comment", { repo: "acme/app" }),
    );
    if (lonely.verdict !== "hold") throw new Error("expected a hold");
    expect(await gate.waitForHold(lonely.holdId, { timeoutMs: 6_000 })).toBe("expired");
  });
});

describe("HybridGate", () => {
  it("makes the same decisions as remote mode and uploads them unflagged", async () => {
    const http = remote();
    const local = hybrid();
    const a = await http.signPlan(planFor(user, STEPS));
    const b = await local.signPlan(planFor(user, STEPS));
    const strip = (d: { verdict: string; ruleId: string | null; reason?: string }) => [
      d.verdict,
      d.ruleId,
      d.reason,
    ];
    for (const c of CALLS()) {
      const viaServer = await http.check(a.token, c);
      const viaClient = await local.check(b.token, { ...c, callId: `${c.callId}-h` });
      expect(strip(viaClient)).toEqual(strip(viaServer));
    }
    await local.close();
    const uploaded = await clientEntries();
    expect(uploaded).toHaveLength(4);
    expect(uploaded.every((e) => e.flagged === null)).toBe(true);
    expect(uploaded.map((e) => e.clientSeq)).toEqual([1, 2, 3, 4]);
    expect(await verifyAuditChain(prisma)).toMatchObject({ ok: true });
  });

  it("keeps deciding while the server is down, then blocks with audit_backlog, then recovers", async () => {
    const net = switchableFetch();
    const gate = hybrid({ fetch: net.fetch, maxUnacked: 3 });
    const signed = await gate.signPlan(planFor(user, STEPS));
    const ok = () => call("github_list_issues", { repo: "acme/app" });
    expect(await gate.check(signed.token, ok())).toMatchObject({ verdict: "allow" });
    net.state.down = true;
    expect(await gate.check(signed.token, ok())).toMatchObject({ verdict: "allow" });
    expect(await gate.check(signed.token, call("github_create_pull_request"))).toMatchObject({
      verdict: "block",
    });
    expect(await gate.check(signed.token, ok())).toMatchObject({ verdict: "allow" });
    expect(await gate.check(signed.token, ok())).toEqual({
      verdict: "block",
      ruleId: null,
      reason: "audit_backlog",
    });
    expect(
      await gate.check(signed.token, call("github_post_comment", { repo: "acme/app" })),
    ).toMatchObject({
      verdict: "block",
    });
    net.state.down = false;
    await gate.close();
    expect(await clientEntries()).toHaveLength(4);
  });

  it("a hold in hybrid mode goes through the server", async () => {
    const gate = hybrid();
    const signed = await gate.signPlan(planFor(user, STEPS));
    const held = await gate.check(signed.token, call("github_post_comment", { repo: "acme/app" }));
    expect(held).toMatchObject({
      verdict: "hold",
      ruleId: "hold-comments",
      holdId: expect.any(String),
    });
    expect(await prisma.hold.count()).toBe(1);
    await gate.close();
  });

  it("after a crash, a new process uploads the leftovers exactly once", async () => {
    const dir = await outboxDir();
    const net = switchableFetch();
    const crashed = hybrid({ outboxDir: dir, fetch: net.fetch });
    const signed = await crashed.signPlan(planFor(user, STEPS));
    net.state.down = true;
    for (const c of CALLS().slice(0, 3)) await crashed.check(signed.token, c);
    expect(await clientEntries()).toHaveLength(0);

    const restarted = hybrid({ outboxDir: dir });
    await restarted.start();
    expect((await clientEntries()).map((e) => e.clientSeq)).toEqual([1, 2, 3]);
    await restarted.close();

    await writeFile(join(dir, `${signed.planId}.ack`), "0");
    const again = hybrid({ outboxDir: dir });
    await again.start();
    await again.close();
    expect(await clientEntries()).toHaveLength(3);
    expect(await verifyAuditChain(prisma)).toMatchObject({ ok: true });
  });

  it("flags an edited line, a forged verdict and a dropped line", async () => {
    const dir = await outboxDir();
    const net = switchableFetch();
    const first = hybrid({ outboxDir: dir, fetch: net.fetch });
    const signed = await first.signPlan(planFor(user, STEPS));
    net.state.down = true;
    for (const c of [...CALLS().slice(0, 3), call("github_list_issues", { repo: "acme/app" })]) {
      await first.check(signed.token, c);
    }
    const lines = await linesOf(dir, signed.planId);
    const edited = { ...lines[0]!, call: { ...lines[0]!.call!, args: { repo: "acme/private" } } };
    const { localHash: _drop, ...forgedBody } = {
      ...lines[3]!,
      prevLocalHash: lines[1]!.localHash,
      decision: { verdict: Verdict.ALLOW as const, ruleId: "allow-in-plan", planStep: 0 },
      call: { ...lines[3]!.call!, args: { repo: "acme/secret" } },
    };
    const forged = { ...forgedBody, localHash: await hashClientEntry(forgedBody) };
    await writeLines(dir, signed.planId, [edited, lines[1]!, forged]);

    const uploader = hybrid({ outboxDir: dir });
    await uploader.start();
    await uploader.close();
    const stored = await clientEntries();
    const bySeq = new Map(stored.map((e) => [e.clientSeq, e]));
    expect(bySeq.get(1)?.flagged).toBe(AuditFlag.CHAIN_BREAK);
    expect(bySeq.get(2)?.flagged).toBeNull();
    expect(bySeq.get(4)?.flagged).toBe(AuditFlag.DECISION_MISMATCH);
    const gap = stored.find((e) => e.kind === AuditKind.CLIENT_GAP);
    expect(gap).toMatchObject({ flagged: AuditFlag.GAP, payload: { from: 3, to: 3 } });
    const verified = await request(app.getHttpServer())
      .get("/v1/audit/verify")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(verified.body.ok).toBe(true);
    expect(verified.body.flagged.map((f: { flagged: string }) => f.flagged).sort()).toEqual(
      [AuditFlag.CHAIN_BREAK, AuditFlag.DECISION_MISMATCH, AuditFlag.GAP].sort(),
    );
  });

  it("a report for the last required step completes the plan and flushes", async () => {
    const gate = hybrid();
    const signed = await gate.signPlan(planFor(user, STEPS));
    const ok = call("github_list_issues", { repo: "acme/app" });
    await gate.check(signed.token, ok);
    await gate.report(signed.token, ok.callId, ReportOutcome.OK);
    expect((await clientEntries()).map((e) => e.kind)).toEqual([AuditKind.CHECK, AuditKind.REPORT]);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: signed.planId } })).status).toBe(
      "COMPLETED",
    );
    await gate.close();
  });
});
