import type { INestApplication, Type } from "@nestjs/common";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { type PlanInput, verifyChain } from "@intentlock/core";
import request from "supertest";

import { newApiKey } from "../../src/agents/api-keys/utils/api-key.util.js";
import { createAgent } from "../../src/agents/utils/create-agent.util.js";
import { AppModule } from "../../src/app.module.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../../src/auth/constants/session.constants.js";
import { toAuditEntry } from "../../src/audit/utils/to-audit-entry.util.js";
import { newSecret, sha256Hex } from "../../src/common/utils/crypto.util.js";
import { configureApp } from "../../src/configure-app.js";
import { orgDb } from "../../src/org/utils/org-db.util.js";
import type { PrismaClient, Role } from "../../src/generated/prisma/client.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";

export const CSRF = { "X-Intentlock-CSRF": "1" };

export async function createTestApp(
  opts: {
    controllers?: Type[];
    override?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
  } = {},
): Promise<INestApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: opts.controllers ?? [],
  });
  const mod = await (opts.override?.(builder) ?? builder).compile();
  const app = configureApp(mod.createNestApplication());
  await app.init();
  return app;
}

export async function createOrg(prisma: PrismaClient) {
  return (await prisma.organization.create({ data: { name: "Test Org" } })).id;
}

let n = 0;

// Unique emails per call so the per-email login limit never collides across tests.
export async function createUser(
  prisma: PrismaClient,
  orgId: string,
  role: Role = UserRole.MEMBER,
  groups: string[] = [],
) {
  const token = newSecret();
  const user = await prisma.user.create({
    data: {
      orgId,
      email: `${role}-${++n}@test.dev`,
      role,
      groups,
      loginTokenHash: sha256Hex(token),
    },
  });
  return { user, token };
}

export async function sessionCookie(prisma: PrismaClient, user: { id: string; orgId: string }) {
  const value = newSecret();
  await prisma.session.create({
    data: {
      id: sha256Hex(value),
      orgId: user.orgId,
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return `${SESSION_COOKIE}=${value}`;
}

export async function verifyAuditChain(prisma: PrismaClient) {
  const rows = await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } });
  return verifyChain(rows.map(toAuditEntry));
}

export async function signedIn(prisma: PrismaClient, orgId: string, role: Role = UserRole.MEMBER) {
  const { user } = await createUser(prisma, orgId, role);
  return { user, cookie: await sessionCookie(prisma, user) };
}

export async function createAgentWithKey(prisma: PrismaClient, orgId: string, name = "bot") {
  const agent = await createAgent(orgDb(prisma, orgId), orgId, { name, createdBy: "test" });
  const { key, prefix, hash } = newApiKey(process.env["API_KEY_PEPPER"] ?? "");
  const apiKey = await prisma.apiKey.create({
    data: { orgId, agentId: agent.id, name: "test", prefix, hash, createdBy: "test" },
  });
  return { agent, apiKey, key, auth: { Authorization: `Bearer ${key}` } };
}

export function planFor(user: string, steps: PlanInput["steps"]): PlanInput {
  return { version: 1, goal: "test run", user, steps };
}

export async function publish(
  app: INestApplication,
  agentId: string,
  cookie: string,
  source: string,
) {
  const current = await request(app.getHttpServer())
    .get(`/v1/agents/${agentId}/policy`)
    .set("Cookie", cookie)
    .expect(200);
  await request(app.getHttpServer())
    .post(`/v1/agents/${agentId}/policy/publish`)
    .set("Cookie", cookie)
    .set(CSRF)
    .send({ source, baseVersion: current.body.active.version, message: "test" })
    .expect(201);
}

export function call(
  tool: string,
  args: Record<string, unknown> = {},
  callId = `${tool}-${Math.random()}`,
) {
  return { tool, args, callId };
}
