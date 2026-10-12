import type { INestApplication } from "@nestjs/common";
import { STARTER_POLICY } from "@intentlock/core";
import request from "supertest";

import { AuditService } from "../src/audit/audit.service.js";
import { AuditKind } from "../src/audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../src/audit/enums/audit-verdict.enum.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";
import { createOrg, createTestApp, CSRF, signedIn, verifyAuditChain } from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const HOLD_COMMENTS = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;
const BROKEN =
  "version: 1\ndefault: block\nrules:\n  - id: Bad_Id\n    match: {}\n    decision: allow\n";

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let agentId: string;

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
  const res = await request(app.getHttpServer())
    .post("/v1/agents")
    .set("Cookie", admin.cookie)
    .set(CSRF)
    .send({ name: "github-assistant" })
    .expect(201);
  agentId = res.body.id;
});

const http = () => request(app.getHttpServer());
const url = (path = "") => `/v1/agents/${agentId}/policy${path}`;
const post = (path: string, body: object, cookie = admin.cookie) =>
  http().post(url(path)).set("Cookie", cookie).set(CSRF).send(body);

const comment = {
  call: { tool: "github_post_comment", args: { body: "hi" }, callId: "c1" },
  user: { email: "alice@test.dev", role: UserRole.MEMBER },
};

describe("reading", () => {
  it("starts with the starter policy as the active version and no draft", async () => {
    const res = await http().get(url()).set("Cookie", admin.cookie).expect(200);
    expect(res.body.active).toMatchObject({
      version: 1,
      source: STARTER_POLICY,
      rolledBackFrom: null,
    });
    expect(res.body.draft).toBeNull();
  });
});

describe("validate and draft", () => {
  it("validates with line numbers", async () => {
    expect((await post("/validate", { source: HOLD_COMMENTS }).expect(200)).body).toEqual({
      ok: true,
      errors: [],
    });
    const bad = await post("/validate", { source: BROKEN }).expect(200);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.errors[0]).toMatchObject({ line: 4 });
  });

  it("saves a draft (even an invalid one) without touching the active version", async () => {
    const res = await http()
      .put(url("/draft"))
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ source: BROKEN, baseVersion: 1 })
      .expect(200);
    expect(res.body.validation.ok).toBe(false);
    const got = await http().get(url()).set("Cookie", admin.cookie).expect(200);
    expect(got.body.draft).toMatchObject({ source: BROKEN, baseVersion: 1 });
    expect(got.body.active.version).toBe(1);
  });

  it("only admins save drafts", async () => {
    const { cookie } = await signedIn(prisma, orgId, UserRole.APPROVER);
    await http()
      .put(url("/draft"))
      .set("Cookie", cookie)
      .set(CSRF)
      .send({ source: HOLD_COMMENTS, baseVersion: 1 })
      .expect(403);
  });
});

describe("test (dry run)", () => {
  it("compares sample calls under the active version and the draft", async () => {
    const res = await post("/test", { source: HOLD_COMMENTS, calls: [comment] }).expect(200);
    expect(res.body.results[0]).toMatchObject({
      from: { verdict: "allow", ruleId: "allow-in-plan" },
      to: { verdict: "hold", ruleId: "hold-comments" },
    });
    expect(res.body.changed).toEqual([{ from: "allow", to: "hold", count: 1 }]);
    expect(await prisma.policyVersion.count()).toBe(1);
  });

  it("replays the agent's last decisions from the audit log", async () => {
    const { user } = await signedIn(prisma, orgId, UserRole.MEMBER);
    const audit = app.get(AuditService);
    const entry = (tool: string) => ({
      kind: AuditKind.CHECK,
      agentId,
      user: user.email,
      verdict: AuditVerdict.ALLOW,
      payload: { call: { tool, args: {}, callId: tool }, inPlan: true },
    });
    await audit.append(orgId, [
      entry("github_list_issues"),
      entry("github_post_comment"),
      entry("github_get_issue"),
    ]);
    const res = await post("/test", { source: HOLD_COMMENTS, replayLast: 2 }).expect(200);
    expect(res.body.results.map((r: { call: { tool: string } }) => r.call.tool)).toEqual([
      "github_post_comment",
      "github_get_issue",
    ]);
    expect(res.body.changed).toEqual([{ from: "allow", to: "hold", count: 1 }]);
  });

  it("is open to approvers, not members, and rejects an invalid source", async () => {
    const approver = await signedIn(prisma, orgId, UserRole.APPROVER);
    const member = await signedIn(prisma, orgId, UserRole.MEMBER);
    await post("/test", { source: HOLD_COMMENTS, calls: [comment] }, approver.cookie).expect(200);
    await post("/test", { source: HOLD_COMMENTS, calls: [comment] }, member.cookie).expect(403);
    const bad = await post("/test", { source: BROKEN }).expect(400);
    expect(bad.body.error).toBe("invalid_policy");
  });
});

describe("publish and rollback", () => {
  it("publishes version N+1, clears the draft and audits it", async () => {
    await http()
      .put(url("/draft"))
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ source: HOLD_COMMENTS, baseVersion: 1 })
      .expect(200);
    const v1 = await prisma.policyVersion.findFirstOrThrow({ where: { version: 1 } });
    const res = await post("/publish", {
      source: HOLD_COMMENTS,
      baseVersion: 1,
      message: "Hold comments",
    }).expect(201);
    expect(res.body).toMatchObject({
      version: 2,
      message: "Hold comments",
      authorId: admin.user.id,
    });

    const got = await http().get(url()).set("Cookie", admin.cookie).expect(200);
    expect(got.body.active.version).toBe(2);
    expect(got.body.draft).toBeNull();
    const versions = await http().get(url("/versions")).set("Cookie", admin.cookie).expect(200);
    expect(versions.body.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions.body[0]).not.toHaveProperty("source");
    const one = await http().get(url("/versions/1")).set("Cookie", admin.cookie).expect(200);
    expect(one.body.source).toBe(STARTER_POLICY);
    expect(await prisma.policyVersion.findFirstOrThrow({ where: { version: 1 } })).toEqual(v1);

    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.POLICY_PUBLISHED },
    });
    expect(entry).toMatchObject({ agentId, policyVersion: 2, actor: admin.user.id });
  });

  it("rejects a stale baseVersion with 409 and the current version", async () => {
    await post("/publish", { source: HOLD_COMMENTS, baseVersion: 1, message: "first" }).expect(201);
    const stale = await post("/publish", {
      source: STARTER_POLICY,
      baseVersion: 1,
      message: "second",
    }).expect(409);
    expect(stale.body).toMatchObject({ error: "stale_base_version", activeVersion: 2 });
  });

  it("lets only one of two concurrent publishes on the same base win", async () => {
    const results = await Promise.all([
      post("/publish", { source: HOLD_COMMENTS, baseVersion: 1, message: "a" }),
      post("/publish", { source: STARTER_POLICY, baseVersion: 1, message: "b" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.policyVersion.count()).toBe(2);
  });

  it("refuses an invalid policy and non-admins", async () => {
    expect(
      (await post("/publish", { source: BROKEN, baseVersion: 1, message: "x" }).expect(400)).body
        .error,
    ).toBe("invalid_policy");
    const { cookie } = await signedIn(prisma, orgId, UserRole.APPROVER);
    await post("/publish", { source: HOLD_COMMENTS, baseVersion: 1, message: "x" }, cookie).expect(
      403,
    );
  });

  it("rolls back by writing a new version that copies the old one", async () => {
    await post("/publish", { source: HOLD_COMMENTS, baseVersion: 1, message: "hold" }).expect(201);
    const res = await post("/rollback", { toVersion: 1, message: "too strict" }).expect(201);
    const v1 = await prisma.policyVersion.findFirstOrThrow({ where: { version: 1 } });
    expect(res.body).toMatchObject({
      version: 3,
      rolledBackFrom: 1,
      hash: v1.hash,
      source: STARTER_POLICY,
    });
    await post("/rollback", { toVersion: 3, message: "noop" }).expect(400);
    await post("/rollback", { toVersion: 9, message: "nope" }).expect(404);
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      AuditKind.AGENT_CREATED,
      AuditKind.POLICY_PUBLISHED,
      AuditKind.POLICY_ROLLED_BACK,
    ]);
    expect(await verifyAuditChain(prisma)).toMatchObject({ ok: true, count: 3 });
  });
});
