import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  CSRF,
  planFor,
  publish,
  signedIn,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const POLICY = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
  - id: no-delete
    match: { tool: github_delete_issue }
    decision: block
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let approver: Awaited<ReturnType<typeof signedIn>>;
let alice: Awaited<ReturnType<typeof signedIn>>;
let bob: Awaited<ReturnType<typeof signedIn>>;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;
let alicePlan: string;
let bobPlan: string;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

const http = () => request(app.getHttpServer());

async function run(user: string) {
  const plan = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({
      plan: planFor(user, [
        { tool: "github_list_issues", required: true },
        { tool: "github_post_comment" },
        { tool: "github_delete_issue" },
      ]),
    })
    .expect(201);
  const send = (c: object) =>
    http().post("/v1/check").set(bot.auth).send({ token: plan.body.token, call: c }).expect(200);
  const listed = call("github_list_issues");
  await send(listed);
  await send(call("github_post_comment"));
  await send(call("github_delete_issue"));
  await send(call("github_create_pull_request"));
  await http()
    .post("/v1/report")
    .set(bot.auth)
    .send({ token: plan.body.token, callId: listed.callId, outcome: "ok" });
  return plan.body.planId as string;
}

beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  approver = await signedIn(prisma, orgId, UserRole.APPROVER);
  alice = await signedIn(prisma, orgId, UserRole.MEMBER);
  bob = await signedIn(prisma, orgId, UserRole.MEMBER);
  bot = await createAgentWithKey(prisma, orgId);
  await publish(app, bot.agent.id, admin.cookie, POLICY);
  alicePlan = await run(alice.user.email);
  bobPlan = await run(bob.user.email);
});

describe("runs", () => {
  it("lists runs with decision counts; members only see their own", async () => {
    const all = await http().get("/v1/runs").set("Cookie", approver.cookie).expect(200);
    expect(all.body.runs.map((r: { planId: string }) => r.planId)).toEqual([bobPlan, alicePlan]);
    expect(all.body.runs[0]).toMatchObject({
      agentName: "bot",
      status: "completed",
      counts: { allow: 1, block: 2, hold: 1 },
    });
    const own = await http()
      .get(`/v1/runs?user=${bob.user.email}`)
      .set("Cookie", alice.cookie)
      .expect(200);
    expect(own.body.runs.map((r: { planId: string }) => r.planId)).toEqual([alicePlan]);
    const page = await http().get("/v1/runs?limit=1").set("Cookie", admin.cookie).expect(200);
    const next = await http()
      .get(`/v1/runs?limit=1&cursor=${page.body.nextCursor}`)
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(next.body.runs[0].planId).toBe(alicePlan);
    const completed = await http()
      .get("/v1/runs?status=active")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(completed.body.runs).toEqual([]);
  });

  it("shows a run in order with holds and reports; another member gets 404", async () => {
    const res = await http().get(`/v1/runs/${alicePlan}`).set("Cookie", alice.cookie).expect(200);
    expect(res.body.plan).toMatchObject({
      id: alicePlan,
      user: alice.user.email,
      policyVersion: 2,
    });
    expect(res.body.agent).toMatchObject({ name: "bot" });
    expect(
      res.body.decisions.map((d: { tool: string; verdict: string }) => [d.tool, d.verdict]),
    ).toEqual([
      ["github_list_issues", "allow"],
      ["github_post_comment", "hold"],
      ["github_delete_issue", "block"],
      ["github_create_pull_request", "block"],
    ]);
    expect(res.body.decisions[1].holdId).toBe(res.body.holds[0].id);
    expect(res.body.decisions[3].reason).toBe("not_in_plan");
    expect(res.body.reports).toMatchObject([{ outcome: "ok" }]);
    await http().get(`/v1/runs/${alicePlan}`).set("Cookie", bob.cookie).expect(404);
    await http().get(`/v1/runs/${alicePlan}`).set("Cookie", approver.cookie).expect(200);
  });
});

describe("stats overview", () => {
  it("aggregates decisions, top blocked tools and rules, and pending holds", async () => {
    const res = await http().get("/v1/stats/overview").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({
      bucket: "hour",
      totals: { allow: 2, block: 4, hold: 2 },
      pendingHolds: 2,
      holdOutcomes: { approved: 0, rejected: 0, expired: 0 },
      flagged: 0,
      auditLag: null,
      medianApprovalSeconds: null,
    });
    expect(res.body.topBlockedTools).toEqual(
      expect.arrayContaining([
        { tool: "github_delete_issue", count: 2 },
        { tool: "github_create_pull_request", count: 2 },
      ]),
    );
    expect(res.body.topBlockedRules).toEqual([{ ruleId: "no-delete", count: 2 }]);
    expect(res.body.series.reduce((n: number, b: { allow: number }) => n + b.allow, 0)).toBe(2);
  });

  it("scopes members to their own runs and reports approval time", async () => {
    const holds = await prisma.hold.findMany({ where: { user: alice.user.email } });
    await http()
      .post(`/v1/holds/${holds[0]!.id}/approve`)
      .set("Cookie", approver.cookie)
      .set(CSRF)
      .send({})
      .expect(200);
    const mine = await http().get("/v1/stats/overview").set("Cookie", alice.cookie).expect(200);
    expect(mine.body).toMatchObject({
      totals: { allow: 1, block: 2, hold: 1 },
      pendingHolds: 0,
      holdOutcomes: { approved: 1, rejected: 0, expired: 0 },
    });
    const other = await prisma.hold.findFirstOrThrow({
      where: { user: { not: alice.user.email } },
    });
    await prisma.hold.update({
      where: { id: other.id },
      data: { status: "EXPIRED", resolvedAt: new Date() },
    });
    const all = await http().get("/v1/stats/overview").set("Cookie", admin.cookie).expect(200);
    expect(all.body.holdOutcomes).toEqual({ approved: 1, rejected: 0, expired: 1 });
    const stillMine = await http().get("/v1/stats/overview").set("Cookie", alice.cookie);
    expect(stillMine.body.holdOutcomes).toEqual({ approved: 1, rejected: 0, expired: 0 });
    expect(mine.body.medianApprovalSeconds).toEqual(expect.any(Number));
  });

  it("rejects an empty or oversized range and picks daily buckets for long ones", async () => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    await http()
      .get(`/v1/stats/overview?from=${iso(now)}&to=${iso(now - 1000)}`)
      .set("Cookie", admin.cookie)
      .expect(400);
    await http()
      .get(`/v1/stats/overview?from=${iso(now - 100 * 86_400_000)}`)
      .set("Cookie", admin.cookie)
      .expect(400);
    const week = await http()
      .get(`/v1/stats/overview?from=${iso(now - 7 * 86_400_000)}&to=${iso(now + 1000)}`)
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(week.body.bucket).toBe("day");
  });
});
