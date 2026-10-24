import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { INestApplication } from "@nestjs/common";
import { verifyWebhook, WEBHOOK_EVENT_ID_HEADER, WEBHOOK_SIGNATURE_HEADER } from "@intentlock/core";
import request from "supertest";

import { AuditService } from "../../src/audit/audit.service.js";
import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { HoldWebhooks } from "../../src/holds/hold-webhooks.service.js";
import { HoldsService } from "../../src/holds/holds.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
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

type Received = { headers: Record<string, string | string[] | undefined>; body: string };

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let approver: Awaited<ReturnType<typeof signedIn>>;
let requester: Awaited<ReturnType<typeof signedIn>>;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;
let receiver: Server;
let receiverUrl: string;
let received: Received[];
let answers: number[];

beforeAll(async () => {
  app = await createTestApp();
  receiver = createServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => (body += c.toString()));
    req.on("end", () => {
      received.push({ headers: req.headers, body });
      res.statusCode = answers.shift() ?? 200;
      res.end();
    });
  });
  await new Promise<void>((r) => receiver.listen(0, "127.0.0.1", r));
  receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hooks/intentlock`;
});
afterAll(async () => {
  await app.close();
  await new Promise((r) => receiver.close(r));
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  received = [];
  answers = [];
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  approver = await signedIn(prisma, orgId, UserRole.APPROVER);
  requester = await signedIn(prisma, orgId, UserRole.MEMBER);
  bot = await createAgentWithKey(prisma, orgId);
  await publish(app, bot.agent.id, admin.cookie, policy);
});

const http = () => request(app.getHttpServer());
const webhooks = () => app.get(HoldWebhooks);

async function setWebhook(): Promise<string> {
  const res = await http()
    .put(`/v1/agents/${bot.agent.id}/webhook`)
    .set("Cookie", admin.cookie)
    .set(CSRF)
    .send({ url: receiverUrl })
    .expect(200);
  return res.body.secret as string;
}

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
  return { holdId: res.body.holdId as string, planId: plan.body.planId as string };
}

const resolve = (holdId: string, action: "approve" | "reject") =>
  http().post(`/v1/holds/${holdId}/${action}`).set("Cookie", approver.cookie).set(CSRF).send({});

describe("agent webhook route", () => {
  it("admin sets it (secret shown once), others cannot, removing is audited", async () => {
    for (const who of [approver, requester]) {
      await http()
        .put(`/v1/agents/${bot.agent.id}/webhook`)
        .set("Cookie", who.cookie)
        .set(CSRF)
        .send({ url: receiverUrl })
        .expect(403);
    }
    await http()
      .put(`/v1/agents/${bot.agent.id}/webhook`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ url: "ftp://example.com/x" })
      .expect(400);

    const secret = await setWebhook();
    expect(secret).toMatch(/^il_whsec_/);
    const agent = await http().get(`/v1/agents/${bot.agent.id}`).set("Cookie", admin.cookie);
    expect(agent.body.webhookUrl).toBe(receiverUrl);
    expect(JSON.stringify(agent.body)).not.toContain(secret);
    expect(await setWebhook()).not.toBe(secret);

    await http()
      .delete(`/v1/agents/${bot.agent.id}/webhook`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .expect(204);
    const after = await http().get(`/v1/agents/${bot.agent.id}`).set("Cookie", admin.cookie);
    expect(after.body.webhookUrl).toBeNull();
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds.filter((k) => k === AuditKind.AGENT_WEBHOOK_SET)).toHaveLength(2);
    expect(kinds).toContain(AuditKind.AGENT_WEBHOOK_REMOVED);
  });
});

describe("hold resolved webhooks", () => {
  it("approve: one signed event, delivered once and audited", async () => {
    const secret = await setWebhook();
    const { holdId, planId } = await newHold();
    await resolve(holdId, "approve").expect(200);
    expect(await prisma.holdEvent.count()).toBe(1);

    await webhooks().deliverDue();
    await webhooks().deliverDue();
    expect(received).toHaveLength(1);
    const [hit] = received;
    const event = await verifyWebhook(
      secret,
      hit!.body,
      hit!.headers[WEBHOOK_SIGNATURE_HEADER] as string,
      new Date(),
    );
    expect(event).toMatchObject({ type: "hold.resolved", holdId, planId, status: "approved" });
    expect(hit!.headers[WEBHOOK_EVENT_ID_HEADER]).toBe(event!.id);
    const audit = await prisma.auditEntry.findMany({ where: { kind: AuditKind.HOLD_WEBHOOK } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.payload).toMatchObject({ holdId, outcome: "delivered", attempt: 1 });
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });

  it("reject, expire and agent delete each queue an event in the same transaction", async () => {
    await setWebhook();
    const rejected = await newHold();
    const expired = await newHold();
    const orphaned = await newHold();
    await resolve(rejected.holdId, "reject").expect(200);
    await prisma.hold.update({
      where: { id: expired.holdId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(HoldsService).expireDue(orgId);
    await http().delete(`/v1/agents/${bot.agent.id}`).set("Cookie", admin.cookie).set(CSRF);

    const events = await prisma.holdEvent.findMany();
    expect(Object.fromEntries(events.map((e) => [e.holdId, e.status]))).toEqual({
      [rejected.holdId]: "REJECTED",
      [expired.holdId]: "EXPIRED",
      [orphaned.holdId]: "REJECTED",
    });
  });

  it("a failed delivery is retried later, and two workers deliver it only once", async () => {
    await setWebhook();
    answers = [500];
    const { holdId } = await newHold();
    await resolve(holdId, "approve").expect(200);

    await webhooks().deliverDue();
    let event = await prisma.holdEvent.findFirstOrThrow();
    expect(event).toMatchObject({ attempts: 1, deliveredAt: null, lastError: "answered 500" });
    expect(event.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    await prisma.holdEvent.update({ where: { id: event.id }, data: { nextAttemptAt: new Date() } });
    const other = new HoldWebhooks(app.get(PrismaService), app.get(AuditService));
    await Promise.all([webhooks().deliverDue(), other.deliverDue()]);

    event = await prisma.holdEvent.findFirstOrThrow();
    expect(event).toMatchObject({ attempts: 2, lastError: null });
    expect(event.deliveredAt).not.toBeNull();
    expect(received).toHaveLength(2);
    const outcomes = (
      await prisma.auditEntry.findMany({
        where: { kind: AuditKind.HOLD_WEBHOOK },
        orderBy: { seq: "asc" },
      })
    ).map((e) => (e.payload as { outcome: string }).outcome);
    expect(outcomes).toEqual(["retry", "delivered"]);
  });

  it("gives up after the last retry, and at once if the webhook was removed", async () => {
    await setWebhook();
    answers = [503, 503];
    const first = await newHold();
    await resolve(first.holdId, "approve").expect(200);
    await webhooks().deliverDue();
    await prisma.holdEvent.updateMany({ data: { attempts: 7, nextAttemptAt: new Date() } });
    await webhooks().deliverDue();
    const gaveUp = await prisma.holdEvent.findFirstOrThrow({ where: { holdId: first.holdId } });
    expect(gaveUp).toMatchObject({ attempts: 8, lastError: "answered 503" });
    expect(gaveUp.failedAt).not.toBeNull();

    answers = [500];
    const second = await newHold();
    await resolve(second.holdId, "approve").expect(200);
    await webhooks().deliverDue();
    await prisma.agent.update({
      where: { id: bot.agent.id },
      data: { webhookUrl: null, webhookSecret: null },
    });
    await prisma.holdEvent.updateMany({
      where: { holdId: second.holdId },
      data: { nextAttemptAt: new Date() },
    });
    await webhooks().deliverDue();
    const removed = await prisma.holdEvent.findFirstOrThrow({ where: { holdId: second.holdId } });
    expect(removed).toMatchObject({ attempts: 2, lastError: "no webhook url set for the agent" });
    expect(removed.failedAt).not.toBeNull();
    expect(received).toHaveLength(3);
  });

  it("no webhook set: nothing is queued", async () => {
    const { holdId } = await newHold();
    await resolve(holdId, "approve").expect(200);
    expect(await prisma.holdEvent.count()).toBe(0);
  });
});

describe("hold lookup for resume", () => {
  it("wait with timeout=0 returns the status and the exact call", async () => {
    const { holdId, planId } = await newHold();
    const pending = await http()
      .get(`/v1/holds/${holdId}/wait?timeout=0`)
      .set(bot.auth)
      .expect(200);
    expect(pending.body).toMatchObject({
      status: "pending",
      planId,
      tool: "github_post_comment",
      args: { body: "hi" },
    });
    expect(pending.body.callId).toEqual(expect.any(String));
    await resolve(holdId, "approve").expect(200);
    const done = await http().get(`/v1/holds/${holdId}/wait?timeout=0`).set(bot.auth).expect(200);
    expect(done.body.status).toBe("approved");
  });
});
