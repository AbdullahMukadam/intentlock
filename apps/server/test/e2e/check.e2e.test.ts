import type { INestApplication } from "@nestjs/common";
import { verifyChain } from "@intentlock/core";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  planFor,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let member: Awaited<ReturnType<typeof signedIn>>;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  member = await signedIn(prisma, orgId, UserRole.MEMBER);
  bot = await createAgentWithKey(prisma, orgId);
});

const http = () => request(app.getHttpServer());

async function signPlan(user = member.user.email, maxCalls = 20) {
  const res = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({
      plan: planFor(user, [
        {
          tool: "github_list_issues",
          args: { repo: { eq: "acme/app" } },
          maxCalls,
          required: true,
        },
      ]),
    })
    .expect(201);
  return res.body as { planId: string; token: string };
}

const check = (token: string, c: unknown, auth = bot.auth) =>
  http().post("/v1/check").set(auth).send({ token, call: c }).expect(200);

describe("POST /v1/check", () => {
  it("allows an in-plan call, then report completes the plan", async () => {
    const { token, planId } = await signPlan();
    const c = call("github_list_issues", { repo: "acme/app" });
    expect((await check(token, c)).body).toEqual({
      verdict: "allow",
      ruleId: "allow-in-plan",
      planStep: 0,
    });
    const report = await http()
      .post("/v1/report")
      .set(bot.auth)
      .send({ token, callId: c.callId, outcome: "ok" })
      .expect(200);
    expect(report.body).toEqual({ planStatus: "completed" });
    await http()
      .post("/v1/report")
      .set(bot.auth)
      .send({ token, callId: c.callId, outcome: "ok" })
      .expect(200);
    expect((await prisma.stepUsage.findFirstOrThrow({ where: { planId } })).ran).toBe(1);
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.REPORT } })).toBe(1);
    await http()
      .post("/v1/report")
      .set(bot.auth)
      .send({ token, callId: "nope", outcome: "ok" })
      .expect(404);
  });

  it("blocks off-plan calls and records them as not in plan", async () => {
    const { token } = await signPlan();
    const offPlan = await check(token, call("github_create_pull_request"));
    expect(offPlan.body).toEqual({ verdict: "block", ruleId: null, reason: "not_in_plan" });
    const wrongRepo = await check(token, call("github_list_issues", { repo: "acme/private" }));
    expect(wrongRepo.body.reason).toBe("not_in_plan");
    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.CHECK },
      orderBy: { seq: "asc" },
    });
    expect(entry).toMatchObject({
      verdict: "block",
      tool: "github_create_pull_request",
      user: member.user.email,
    });
    expect(entry.payload).toMatchObject({ inPlan: false });
  });

  it("fails closed on bad calls and bad or foreign tokens", async () => {
    const { token } = await signPlan();
    expect((await check(token, { tool: 42 })).body.reason).toBe("invalid_call");
    expect((await check("not.a.token", call("github_list_issues"))).body.reason).toBe(
      "invalid_token",
    );
    const other = await createAgentWithKey(prisma, orgId, "other");
    expect(
      (await check(token, call("github_list_issues", { repo: "acme/app" }), other.auth)).body
        .reason,
    ).toBe("invalid_token");
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.CHECK } })).toBe(3);
  });

  it("never lets concurrent calls overshoot maxCalls", async () => {
    const { token, planId } = await signPlan(member.user.email, 3);
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        check(token, call("github_list_issues", { repo: "acme/app" })),
      ),
    );
    expect(results.filter((r) => r.body.verdict === "allow")).toHaveLength(3);
    expect(results.filter((r) => r.body.reason === "call_limit")).toHaveLength(7);
    expect((await prisma.stepUsage.findFirstOrThrow({ where: { planId } })).calls).toBe(3);
  });

  it("keeps a valid chain under 50 concurrent checks", async () => {
    const { token } = await signPlan(member.user.email, 50);
    await Promise.all(
      Array.from({ length: 50 }, () =>
        check(token, call("github_list_issues", { repo: "acme/app" })),
      ),
    );
    expect(await verifyAuditChain(prisma)).toMatchObject({ ok: true, count: 51 });
    const seqs = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map((e) => e.seq);
    expect(seqs).toEqual(Array.from({ length: 51 }, (_, i) => i + 1));
  });
});

describe("audit endpoints", () => {
  it("verify points at the first tampered entry", async () => {
    const { token } = await signPlan();
    for (let i = 0; i < 3; i++)
      await check(token, call("github_list_issues", { repo: "acme/app" }));
    expect(
      (await http().get("/v1/audit/verify").set("Cookie", member.cookie).expect(200)).body,
    ).toMatchObject({
      ok: true,
      count: 4,
    });
    await prisma.$executeRaw`UPDATE "AuditEntry" SET payload = '{"forged":true}'::jsonb WHERE seq = 3`;
    const broken = await http().get("/v1/audit/verify").set("Cookie", member.cookie).expect(200);
    expect(broken.body).toMatchObject({ ok: false, count: 2, firstBrokenSeq: 3 });
  });

  it("scopes members to their own runs and paginates", async () => {
    const other = await signedIn(prisma, orgId, UserRole.MEMBER);
    const mine = await signPlan(member.user.email);
    const theirs = await signPlan(other.user.email);
    await check(mine.token, call("github_list_issues", { repo: "acme/app" }));
    await check(theirs.token, call("github_list_issues", { repo: "acme/app" }));

    const own = await http().get("/v1/audit").set("Cookie", member.cookie).expect(200);
    expect(own.body.entries.every((e: { user: string }) => e.user === member.user.email)).toBe(
      true,
    );
    expect(own.body.entries).toHaveLength(2);
    const sneaky = await http()
      .get(`/v1/audit?user=${other.user.email}`)
      .set("Cookie", member.cookie)
      .expect(200);
    expect(sneaky.body.entries.every((e: { user: string }) => e.user === member.user.email)).toBe(
      true,
    );

    const all = await http().get("/v1/audit?kind=x").set("Cookie", admin.cookie).expect(400);
    expect(all.body.error).toBe("validation_failed");
    const page1 = await http().get("/v1/audit?limit=3").set("Cookie", admin.cookie).expect(200);
    expect(page1.body.entries).toHaveLength(3);
    const page2 = await http()
      .get(`/v1/audit?limit=3&cursor=${page1.body.nextCursor}`)
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(page2.body.entries).toHaveLength(1);
    expect(page2.body.nextCursor).toBeNull();
    const allows = await http()
      .get("/v1/audit?verdict=allow&q=LIST_ISSUES")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(allows.body.entries).toHaveLength(2);
  });

  it("exports JSONL that verifies offline", async () => {
    const { token } = await signPlan();
    await check(token, call("github_list_issues", { repo: "acme/app" }));
    await check(token, call("github_delete_repo"));
    const res = await http().get("/v1/audit?format=jsonl").set("Cookie", admin.cookie).expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/x-ndjson/);
    const lines = res.text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as unknown);
    expect(lines).toHaveLength(3);
    expect(await verifyChain(lines)).toEqual({ ok: true, count: 3 });
  });
});
