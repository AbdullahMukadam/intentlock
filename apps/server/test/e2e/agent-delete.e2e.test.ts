import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../../src/audit/enums/audit-verdict.enum.js";
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
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const policy = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
    timeoutSeconds: 300
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

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
  bot = await createAgentWithKey(prisma, orgId, "triage-bot");
  await publish(app, bot.agent.id, admin.cookie, policy);
});

const http = () => request(app.getHttpServer());
const del = (id: string, cookie = admin.cookie) =>
  http().delete(`/v1/agents/${id}`).set("Cookie", cookie).set(CSRF);
const signPlan = () =>
  http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({ plan: planFor(member.user.email, [{ tool: "github_post_comment" }]) });

async function heldRun() {
  const plan = await signPlan().expect(201);
  const res = await http()
    .post("/v1/check")
    .set(bot.auth)
    .send({ token: plan.body.token, call: call("github_post_comment", { body: "hi" }) })
    .expect(200);
  return { holdId: res.body.holdId as string, token: plan.body.token as string };
}

describe("deleting an agent", () => {
  it("revokes keys, rejects pending holds, audits, and keeps the chain valid", async () => {
    const { holdId, token } = await heldRun();
    await del(bot.agent.id, member.cookie).expect(403);
    await del(bot.agent.id).expect(204);

    const hold = await prisma.hold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold).toMatchObject({
      status: "REJECTED",
      resolvedBy: admin.user.id,
      note: "agent deleted",
    });
    expect(await prisma.apiKey.count({ where: { agentId: bot.agent.id, revokedAt: null } })).toBe(
      0,
    );

    await signPlan().expect(401);
    await http()
      .post("/v1/check")
      .set(bot.auth)
      .send({ token, call: call("github_post_comment", { body: "again" }) })
      .expect(401);

    const entries = await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } });
    const tail = entries.slice(-2);
    expect(tail.map((e) => e.kind)).toEqual([AuditKind.HOLD_RESOLVED, AuditKind.AGENT_DELETED]);
    expect(tail[0]).toMatchObject({ verdict: AuditVerdict.REJECTED, actor: admin.user.id });
    expect(tail[1]?.payload).toEqual({ name: "triage-bot" });
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });

  it("refuses plan signing for a deleted agent even with a live key", async () => {
    await del(bot.agent.id).expect(204);
    await prisma.apiKey.update({ where: { id: bot.apiKey.id }, data: { revokedAt: null } });
    const res = await signPlan().expect(403);
    expect(res.body.error).toBe("agent_disabled");
  });

  it("hides the agent from lists, keeps its history, frees its name, and is not repeatable", async () => {
    await heldRun();
    await del(bot.agent.id).expect(204);
    await del(bot.agent.id).expect(404);

    const list = await http().get("/v1/agents").set("Cookie", admin.cookie).expect(200);
    expect(list.body).toEqual([]);
    const all = await http()
      .get("/v1/agents?includeDeleted=true")
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(all.body).toHaveLength(1);
    expect(all.body[0].deletedAt).not.toBeNull();

    const one = await http()
      .get(`/v1/agents/${bot.agent.id}`)
      .set("Cookie", member.cookie)
      .expect(200);
    expect(one.body).toMatchObject({ name: "triage-bot", activeKeys: 0 });

    const writes = [
      () => http().patch(`/v1/agents/${bot.agent.id}`).send({ description: "x" }),
      () => http().get(`/v1/agents/${bot.agent.id}/policy`),
      () => http().post(`/v1/agents/${bot.agent.id}/api-keys`).send({ name: "new" }),
    ];
    for (const req of writes) {
      const res = await req().set("Cookie", admin.cookie).set(CSRF);
      expect(res.status).toBe(404);
    }

    const runs = await http().get("/v1/runs").set("Cookie", admin.cookie).expect(200);
    expect(runs.body.runs[0]).toMatchObject({ agentId: bot.agent.id, agentName: "triage-bot" });

    const create = () =>
      http().post("/v1/agents").set("Cookie", admin.cookie).set(CSRF).send({ name: "triage-bot" });
    await create().expect(201);
    await create().expect(409);
  });
});
