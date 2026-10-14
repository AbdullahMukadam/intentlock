import type { INestApplication } from "@nestjs/common";
import { BundleClaims, Plan, verifyBundle } from "@intentlock/core";
import { createLocalJWKSet } from "jose";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { KeysService } from "../../src/keys/keys.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  createUser,
  CSRF,
  planFor,
  publish,
  signedIn,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const NO_COMMENTS = `version: 1
default: block
rules:
  - id: no-comments
    match: { tool: github_post_comment }
    decision: block
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;
let email: string;

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
  bot = await createAgentWithKey(prisma, orgId);
  email = (await createUser(prisma, orgId, UserRole.MEMBER, ["oncall"])).user.email;
});

const http = () => request(app.getHttpServer());
const steps = [{ tool: "github_post_comment" }, { tool: "github_list_issues", required: true }];
const sign = (plan: object, auth = bot.auth) => http().post("/v1/plans").set(auth).send({ plan });
const check = (token: string, c: object, auth = bot.auth) =>
  http().post("/v1/check").set(auth).send({ token, call: c }).expect(200);

describe("POST /v1/plans", () => {
  it("signs a bundle that verifies against the JWKS and snapshots policy, role and groups", async () => {
    const res = await sign(planFor(email.toUpperCase(), steps)).expect(201);
    expect(res.body).toMatchObject({ policyVersion: 1 });
    expect(res.body.planId).toMatch(/^[0-9A-Z]{26}$/);
    const jwks = await http().get("/v1/keys/jwks").expect(200);
    const claims: BundleClaims = await verifyBundle(
      res.body.token,
      createLocalJWKSet(jwks.body),
      new Date(),
    );
    expect(claims).toMatchObject({
      sub: email,
      jti: res.body.planId,
      agent: bot.agent.id,
      org: orgId,
      polv: 1,
      role: "member",
      groups: ["oncall"],
      ph: res.body.planHash,
      polh: res.body.policyHash,
    });
    expect(await prisma.stepUsage.count({ where: { planId: res.body.planId } })).toBe(2);
    const entry = await prisma.auditEntry.findFirstOrThrow({
      where: { kind: AuditKind.PLAN_SIGNED },
    });
    expect(entry).toMatchObject({
      agentId: bot.agent.id,
      user: email,
      planId: res.body.planId,
      policyVersion: 1,
    });
  });

  it("refuses unknown and disabled users", async () => {
    expect((await sign(planFor("ghost@test.dev", steps)).expect(403)).body.error).toBe(
      "unknown_user",
    );
    await prisma.user.updateMany({ where: { email }, data: { disabledAt: new Date() } });
    await sign(planFor(email, steps)).expect(403);
  });

  it("refuses disabled agents and revoked keys", async () => {
    await prisma.agent.update({ where: { id: bot.agent.id }, data: { disabledAt: new Date() } });
    expect((await sign(planFor(email, steps)).expect(403)).body.error).toBe("agent_disabled");
    await prisma.agent.update({ where: { id: bot.agent.id }, data: { disabledAt: null } });
    await prisma.apiKey.update({ where: { id: bot.apiKey.id }, data: { revokedAt: new Date() } });
    await sign(planFor(email, steps)).expect(401);
  });

  it("rejects pathological regexes and invalid plans", async () => {
    const res = await sign(
      planFor(email, [{ tool: "t", args: { x: { regex: "(a+)+$" } } }]),
    ).expect(400);
    expect(res.body.error).toBe("unsafe_regex");
    await sign({ ...planFor(email, steps), steps: [] }).expect(400);
    await sign(planFor(email, [{ tool: "bad.name" }])).expect(400);
  });

  it("new plans use a newly published policy; running bundles keep their snapshot", async () => {
    const before = (await sign(planFor(email, steps)).expect(201)).body;
    await publish(app, bot.agent.id, admin.cookie, NO_COMMENTS);
    const after = (await sign(planFor(email, steps)).expect(201)).body;
    expect(after.policyVersion).toBe(2);
    expect((await check(before.token, call("github_post_comment"))).body).toMatchObject({
      verdict: "allow",
    });
    expect((await check(after.token, call("github_post_comment"))).body).toMatchObject({
      verdict: "block",
      ruleId: "no-comments",
    });
  });
});

describe("POST /v1/plans/:id/refresh", () => {
  it("re-signs the same plan with the current policy", async () => {
    const signed = (await sign(planFor(email, steps)).expect(201)).body;
    await publish(app, bot.agent.id, admin.cookie, NO_COMMENTS);
    const res = await http()
      .post(`/v1/plans/${signed.planId}/refresh`)
      .set(bot.auth)
      .send({ token: signed.token })
      .expect(201);
    const jwks = await http().get("/v1/keys/jwks").expect(200);
    const claims = await verifyBundle(res.body.token, createLocalJWKSet(jwks.body), new Date());
    expect(claims).toMatchObject({ jti: signed.planId, ph: signed.planHash, polv: 2 });
    expect(await prisma.auditEntry.count({ where: { kind: AuditKind.PLAN_REFRESHED } })).toBe(1);
  });

  it("accepts a recently expired token", async () => {
    const signed = (await sign(planFor(email, steps)).expect(201)).body;
    const row = await prisma.plan.findUniqueOrThrow({ where: { id: signed.planId } });
    const old = await app.get(KeysService).sign(
      {
        planId: signed.planId,
        plan: Plan.parse(row.body),
        agent: bot.agent.id,
        policy: (await prisma.policyVersion.findFirstOrThrow()).compiled as never,
        policyVersion: 1,
        role: UserRole.MEMBER,
        groups: [],
        org: orgId,
      },
      new Date(Date.now() - 20 * 60_000),
    );
    expect((await check(old.token, call("github_list_issues"))).body.reason).toBe("token_expired");
    await http()
      .post(`/v1/plans/${signed.planId}/refresh`)
      .set(bot.auth)
      .send({ token: old.token })
      .expect(201);
  });

  it("rejects a token whose plan hash differs from the stored plan", async () => {
    const signed = (await sign(planFor(email, steps)).expect(201)).body;
    const forged = await app.get(KeysService).sign(
      {
        planId: signed.planId,
        plan: Plan.parse(planFor(email, [...steps, { tool: "github_create_pull_request" }])),
        agent: bot.agent.id,
        policy: (await prisma.policyVersion.findFirstOrThrow()).compiled as never,
        policyVersion: 1,
        role: UserRole.MEMBER,
        groups: [],
        org: orgId,
      },
      new Date(),
    );
    const res = await http()
      .post(`/v1/plans/${signed.planId}/refresh`)
      .set(bot.auth)
      .send({ token: forged.token })
      .expect(409);
    expect(res.body.error).toBe("plan_hash_mismatch");
  });

  it("rejects another plan's token, another agent's key and disabled users", async () => {
    const a = (await sign(planFor(email, steps)).expect(201)).body;
    const b = (await sign(planFor(email, steps)).expect(201)).body;
    await http()
      .post(`/v1/plans/${a.planId}/refresh`)
      .set(bot.auth)
      .send({ token: b.token })
      .expect(400);
    const other = await createAgentWithKey(prisma, orgId, "other");
    await http()
      .post(`/v1/plans/${a.planId}/refresh`)
      .set(other.auth)
      .send({ token: a.token })
      .expect(400);
    await prisma.user.updateMany({ where: { email }, data: { disabledAt: new Date() } });
    await http()
      .post(`/v1/plans/${a.planId}/refresh`)
      .set(bot.auth)
      .send({ token: a.token })
      .expect(403);
  });

  it("is not reachable with a session", async () => {
    await http()
      .post("/v1/plans")
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ plan: planFor(email, steps) })
      .expect(401);
  });
});
