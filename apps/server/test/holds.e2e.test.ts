import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../src/audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../src/audit/enums/audit-verdict.enum.js";
import { HoldsService } from "../src/holds/holds.service.js";
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
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const holdPolicy = (opts: { self?: boolean; timeoutSeconds?: number } = {}) => `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver], self: ${opts.self ?? false} }
    timeoutSeconds: ${opts.timeoutSeconds ?? 300}
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
});

const http = () => request(app.getHttpServer());

async function heldCall(policy = holdPolicy()) {
  await publish(app, bot.agent.id, admin.cookie, policy);
  const plan = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({
      plan: planFor(requester.user.email, [
        { tool: "github_post_comment" },
        { tool: "github_list_issues" },
      ]),
    })
    .expect(201);
  const res = await http()
    .post("/v1/check")
    .set(bot.auth)
    .send({ token: plan.body.token, call: call("github_post_comment", { body: "hi" }) })
    .expect(200);
  expect(res.body).toMatchObject({ verdict: "hold", ruleId: "hold-comments" });
  return {
    holdId: res.body.holdId as string,
    token: plan.body.token as string,
    planId: plan.body.planId as string,
  };
}

const resolve = (holdId: string, action: "approve" | "reject", cookie: string) =>
  http().post(`/v1/holds/${holdId}/${action}`).set("Cookie", cookie).set(CSRF).send({ note: "ok" });
const wait = (holdId: string, timeout = 5) =>
  http().get(`/v1/holds/${holdId}/wait?timeout=${timeout}`).set(bot.auth).expect(200);

describe("holds", () => {
  it("approve wakes a waiting agent and is audited", async () => {
    const { holdId } = await heldCall();
    const waiting = wait(holdId).then((res) => res);
    await new Promise((r) => setTimeout(r, 300));
    const approved = await resolve(holdId, "approve", approver.cookie).expect(200);
    expect(approved.body).toMatchObject({
      status: "approved",
      resolvedBy: approver.user.email,
      note: "ok",
    });
    expect((await waiting).body).toEqual({ status: "approved" });
    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.HOLD_RESOLVED },
    });
    expect(entry).toMatchObject({
      verdict: AuditVerdict.APPROVED,
      actor: approver.user.id,
      user: requester.user.email,
    });
  });

  it("reject is final: a second decision gets 409", async () => {
    const { holdId } = await heldCall();
    await resolve(holdId, "reject", approver.cookie).expect(200);
    expect((await wait(holdId)).body).toEqual({ status: "rejected" });
    expect((await resolve(holdId, "approve", approver.cookie).expect(409)).body).toMatchObject({
      error: "hold_not_pending",
      status: "rejected",
    });
  });

  it("names the approver by email in the hold list and run detail", async () => {
    const { holdId, planId } = await heldCall();
    await resolve(holdId, "approve", approver.cookie).expect(200);
    const list = await http().get("/v1/holds").set("Cookie", admin.cookie).expect(200);
    expect(list.body.find((h: { id: string }) => h.id === holdId)).toMatchObject({
      resolvedBy: approver.user.email,
    });
    const run = await http().get(`/v1/runs/${planId}`).set("Cookie", admin.cookie).expect(200);
    expect(run.body.holds[0]).toMatchObject({ id: holdId, resolvedBy: approver.user.email });
  });

  it("the requester cannot approve their own hold unless self: true", async () => {
    const { holdId } = await heldCall();
    expect((await resolve(holdId, "approve", requester.cookie).expect(403)).body.error).toBe(
      "not_an_approver",
    );
    const selfAllowed = await heldCall(holdPolicy({ self: true }));
    await resolve(selfAllowed.holdId, "approve", requester.cookie).expect(200);
  });

  it("an API key can never approve", async () => {
    const { holdId } = await heldCall();
    await http().post(`/v1/holds/${holdId}/approve`).set(bot.auth).set(CSRF).send({}).expect(401);
  });

  it("lists holds by who may see them", async () => {
    const { holdId } = await heldCall();
    const forApprover = await http()
      .get("/v1/holds?status=pending")
      .set("Cookie", approver.cookie)
      .expect(200);
    expect(forApprover.body).toMatchObject([{ id: holdId, canApprove: true, status: "pending" }]);
    const forRequester = await http().get("/v1/holds").set("Cookie", requester.cookie).expect(200);
    expect(forRequester.body).toMatchObject([{ id: holdId, canApprove: false }]);
    const bystander = await signedIn(prisma, orgId, UserRole.MEMBER);
    expect(
      (await http().get("/v1/holds").set("Cookie", bystander.cookie).expect(200)).body,
    ).toEqual([]);
  });

  it("expires once, even when two instances run the expiry job together", async () => {
    const { holdId } = await heldCall(holdPolicy({ timeoutSeconds: 1 }));
    await new Promise((r) => setTimeout(r, 1_100));
    const holds = app.get(HoldsService);
    const expired = await Promise.all([holds.expireAll(), holds.expireAll()]);
    expect(expired.reduce((a, b) => a + b, 0)).toBe(1);
    expect((await wait(holdId, 0)).body).toEqual({ status: "expired" });
    await resolve(holdId, "approve", approver.cookie).expect(409);
    expect(
      await prisma.auditEntry.count({
        where: { kind: AuditKind.HOLD_RESOLVED, verdict: AuditVerdict.EXPIRED },
      }),
    ).toBe(1);
  });

  it("wait returns pending at its timeout and 404s for another agent's hold", async () => {
    const { holdId } = await heldCall();
    expect((await wait(holdId, 1)).body).toEqual({ status: "pending" });
    const other = await createAgentWithKey(prisma, orgId, "other");
    await http().get(`/v1/holds/${holdId}/wait?timeout=0`).set(other.auth).expect(404);
  });
});

describe("POST /v1/holds (hybrid)", () => {
  it("creates a hold only when the server's check agrees", async () => {
    const { token } = await heldCall();
    const ok = await http()
      .post("/v1/holds")
      .set(bot.auth)
      .send({ token, call: call("github_post_comment"), ruleId: "hold-comments" })
      .expect(201);
    expect(ok.body).toMatchObject({ approvers: { roles: ["approver"] }, timeoutSeconds: 300 });
    expect(ok.body.holdId).toEqual(expect.any(String));
    const bogus = await http()
      .post("/v1/holds")
      .set(bot.auth)
      .send({ token, call: call("github_list_issues"), ruleId: "hold-comments" })
      .expect(409);
    expect(bogus.body.error).toBe("hold_not_justified");
  });
});

describe("shutdown", () => {
  it("returns waiting long-polls immediately instead of holding the process", async () => {
    const { holdId } = await heldCall();
    const started = Date.now();
    const waiting = wait(holdId, 20).then((res) => res);
    await new Promise((r) => setTimeout(r, 300));
    app.get(HoldsService).beforeApplicationShutdown();
    expect((await waiting).body).toEqual({ status: "pending" });
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
