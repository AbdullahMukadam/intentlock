import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
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
let approver: Awaited<ReturnType<typeof signedIn>>;
let requester: Awaited<ReturnType<typeof signedIn>>;
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
  approver = await signedIn(prisma, orgId, UserRole.APPROVER);
  requester = await signedIn(prisma, orgId, UserRole.MEMBER);
  bot = await createAgentWithKey(prisma, orgId);
  await publish(app, bot.agent.id, admin.cookie, policy);
});

const http = () => request(app.getHttpServer());
const bulk = (cookie: string, body: object) =>
  http().post("/v1/holds/resolve").set("Cookie", cookie).set(CSRF).send(body);

async function newHold() {
  const plan = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({ plan: planFor(requester.user.email, [{ tool: "github_post_comment" }]) })
    .expect(201);
  const res = await http()
    .post("/v1/check")
    .set(bot.auth)
    .send({ token: plan.body.token, call: call("github_post_comment", { body: "hi" }) })
    .expect(200);
  return res.body.holdId as string;
}

describe("bulk resolve", () => {
  it("resolves each hold on its own and reports skipped ones", async () => {
    const [a, b, expired, done] = [
      await newHold(),
      await newHold(),
      await newHold(),
      await newHold(),
    ];
    await prisma.hold.update({
      where: { id: expired },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await http()
      .post(`/v1/holds/${done}/reject`)
      .set("Cookie", approver.cookie)
      .set(CSRF)
      .send({})
      .expect(200);
    const before = await prisma.auditEntry.count({ where: { kind: AuditKind.HOLD_RESOLVED } });

    const res = await bulk(approver.cookie, {
      ids: [a, b, expired, done, "missing"],
      approve: true,
      note: "batch",
    }).expect(200);

    expect(res.body).toEqual({
      results: [
        { id: a, outcome: "approved" },
        { id: b, outcome: "approved" },
        { id: expired, outcome: "expired" },
        { id: done, outcome: "not_pending" },
        { id: "missing", outcome: "not_found" },
      ],
      resolved: 2,
      skipped: 3,
    });
    const holds = await prisma.hold.findMany({ where: { id: { in: [a, b] } } });
    expect(holds.every((h) => h.status === "APPROVED" && h.note === "batch")).toBe(true);
    expect(holds.every((h) => h.resolvedBy === approver.user.id)).toBe(true);
    const after = await prisma.auditEntry.count({ where: { kind: AuditKind.HOLD_RESOLVED } });
    expect(after - before).toBe(2);
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });

  it("skips holds the caller may not approve, including their own", async () => {
    const id = await newHold();
    const res = await bulk(requester.cookie, { ids: [id], approve: false }).expect(200);
    expect(res.body).toMatchObject({
      results: [{ id, outcome: "not_an_approver" }],
      resolved: 0,
      skipped: 1,
    });
    expect((await prisma.hold.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");
  });

  it("validates the batch and needs a session", async () => {
    await bulk(approver.cookie, { ids: [], approve: true }).expect(400);
    await bulk(approver.cookie, { ids: ["x", "x"], approve: true }).expect(400);
    await bulk(approver.cookie, {
      ids: Array.from({ length: 101 }, (_, i) => `h${i}`),
      approve: true,
    }).expect(400);
    await http()
      .post("/v1/holds/resolve")
      .set(bot.auth)
      .set(CSRF)
      .send({ ids: ["x"], approve: true })
      .expect(401);
  });
});
