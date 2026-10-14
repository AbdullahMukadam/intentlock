import { Controller, Get, type INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditService } from "../src/audit/audit.service.js";
import { AuditKind } from "../src/audit/enums/audit-kind.enum.js";
import { AuditVerdict } from "../src/audit/enums/audit-verdict.enum.js";
import { AgentAuth } from "../src/common/decorators/agent-auth.decorator.js";
import { CurrentAgent } from "../src/common/decorators/current-agent.decorator.js";
import type { AgentCaller } from "../src/common/types/auth.types.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";
import { createOrg, createTestApp, CSRF, signedIn, verifyAuditChain } from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

@Controller("probe")
class ProbeController {
  @AgentAuth()
  @Get()
  whoami(@CurrentAgent() agent: AgentCaller) {
    return agent;
  }
}

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;

beforeAll(async () => {
  app = await createTestApp({ controllers: [ProbeController] });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
});

const http = () => request(app.getHttpServer());

async function newAgent(name = "github-assistant") {
  const res = await http()
    .post("/v1/agents")
    .set("Cookie", admin.cookie)
    .set(CSRF)
    .send({ name, description: "Triage bot" })
    .expect(201);
  return res.body as { id: string };
}

describe("agents", () => {
  it("creates an agent with the starter policy as v1", async () => {
    const agent = await newAgent();
    expect(agent).toMatchObject({
      name: "github-assistant",
      description: "Triage bot",
      policyVersion: 1,
      activeKeys: 0,
      disabledAt: null,
      last24h: { allow: 0, block: 0, hold: 0 },
    });
    const kinds = (await prisma.auditEntry.findMany()).map((e) => e.kind);
    expect(kinds).toEqual([AuditKind.AGENT_CREATED]);
  });

  it("rejects duplicate and non-kebab-case names", async () => {
    await newAgent("bot");
    await http()
      .post("/v1/agents")
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ name: "bot" })
      .expect(409);
    await http()
      .post("/v1/agents")
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ name: "Bot One" })
      .expect(400);
  });

  it("lets every role view agents but only admins change them", async () => {
    const agent = await newAgent();
    for (const role of [UserRole.MEMBER, UserRole.APPROVER]) {
      const { cookie } = await signedIn(prisma, orgId, role);
      await http().get("/v1/agents").set("Cookie", cookie).expect(200);
      await http().get(`/v1/agents/${agent.id}`).set("Cookie", cookie).expect(200);
      await http()
        .post("/v1/agents")
        .set("Cookie", cookie)
        .set(CSRF)
        .send({ name: "x" })
        .expect(403);
      await http()
        .patch(`/v1/agents/${agent.id}`)
        .set("Cookie", cookie)
        .set(CSRF)
        .send({})
        .expect(403);
      await http().delete(`/v1/agents/${agent.id}`).set("Cookie", cookie).set(CSRF).expect(403);
    }
  });

  it("updates and disables (DELETE is a soft disable)", async () => {
    const agent = await newAgent();
    const patched = await http()
      .patch(`/v1/agents/${agent.id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ name: "triage-bot", description: null })
      .expect(200);
    expect(patched.body).toMatchObject({ name: "triage-bot", description: null });
    const disabled = await http()
      .delete(`/v1/agents/${agent.id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .expect(200);
    expect(disabled.body.disabledAt).not.toBeNull();
    expect(await prisma.agent.count()).toBe(1);
  });

  it("counts the last 24 h of decisions per verdict", async () => {
    const agent = await newAgent();
    const audit = app.get(AuditService);
    const check = (verdict: AuditVerdict) => ({
      kind: AuditKind.CHECK,
      agentId: agent.id,
      verdict,
    });
    await audit.append(orgId, [
      check(AuditVerdict.ALLOW),
      check(AuditVerdict.ALLOW),
      check(AuditVerdict.BLOCK),
      check(AuditVerdict.HOLD),
    ]);
    const list = await http().get("/v1/agents").set("Cookie", admin.cookie).expect(200);
    expect(list.body[0].last24h).toEqual({ allow: 2, block: 1, hold: 1 });
  });

  it("hides agents of other organizations", async () => {
    const other = await prisma.organization.create({ data: { name: "Other" } });
    const foreign = await prisma.agent.create({
      data: { orgId: other.id, name: "foreign", createdBy: "x" },
    });
    await http().get(`/v1/agents/${foreign.id}`).set("Cookie", admin.cookie).expect(404);
    const list = await http().get("/v1/agents").set("Cookie", admin.cookie).expect(200);
    expect(list.body).toEqual([]);
  });
});

describe("API keys", () => {
  it("shows the key once, authenticates agent routes, and stops working when revoked", async () => {
    const agent = await newAgent();
    const created = await http()
      .post(`/v1/agents/${agent.id}/api-keys`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ name: "production" })
      .expect(201);
    const { id, key, prefix } = created.body as { id: string; key: string; prefix: string };
    expect(key).toMatch(/^il_live_[A-Za-z0-9_-]{43}$/);
    expect(prefix).toBe(key.slice(0, 12));

    const list = await http()
      .get(`/v1/agents/${agent.id}/api-keys`)
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ createdBy: admin.user.email });
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(list.body[0]).not.toHaveProperty("hash");

    const probe = await http().get("/probe").set("Authorization", `Bearer ${key}`).expect(200);
    expect(probe.body).toEqual({ orgId, agentId: agent.id, apiKeyId: id });
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id } })).lastUsedAt).not.toBeNull();

    await http()
      .delete(`/v1/agents/${agent.id}/api-keys/${id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .expect(204);
    await http()
      .delete(`/v1/agents/${agent.id}/api-keys/${id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .expect(204);
    await http().get("/probe").set("Authorization", `Bearer ${key}`).expect(401);
    const agentView = await http()
      .get(`/v1/agents/${agent.id}`)
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(agentView.body.activeKeys).toBe(0);

    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      AuditKind.AGENT_CREATED,
      AuditKind.API_KEY_CREATED,
      AuditKind.API_KEY_REVOKED,
    ]);
    expect(await verifyAuditChain(prisma)).toMatchObject({ ok: true, count: 3 });
  });

  it("rejects missing, malformed and unknown keys, and sessions, on agent routes", async () => {
    const { cookie } = await signedIn(prisma, orgId, UserRole.ADMIN);
    await http().get("/probe").expect(401);
    await http().get("/probe").set("Authorization", "Basic abc").expect(401);
    await http().get("/probe").set("Authorization", "Bearer il_live_nope").expect(401);
    await http().get("/probe").set("Cookie", cookie).expect(401);
  });

  it("is admin only, and 404s for unknown agents or keys", async () => {
    const agent = await newAgent();
    const { cookie } = await signedIn(prisma, orgId, UserRole.APPROVER);
    await http().get(`/v1/agents/${agent.id}/api-keys`).set("Cookie", cookie).expect(403);
    await http().get("/v1/agents/nope/api-keys").set("Cookie", admin.cookie).expect(404);
    await http()
      .delete(`/v1/agents/${agent.id}/api-keys/nope`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .expect(404);
  });
});
