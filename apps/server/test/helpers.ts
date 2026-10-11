import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { verifyChain } from "@intentlock/core";

import { AppModule } from "../src/app.module.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../src/auth/constants/session.constants.js";
import { toAuditEntry } from "../src/audit/utils/to-audit-entry.util.js";
import { newSecret, sha256Hex } from "../src/common/utils/crypto.util.js";
import { configureApp } from "../src/configure-app.js";
import type { PrismaClient, Role } from "../src/generated/prisma/client.js";

export const CSRF = { "X-Intentlock-CSRF": "1" };

export async function createTestApp(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(mod.createNestApplication());
  await app.init();
  return app;
}

export async function createOrg(prisma: PrismaClient) {
  return (await prisma.organization.create({ data: { name: "Test Org" } })).id;
}

let n = 0;

/** A user with a known login token; emails are unique per call so rate limits don't collide. */
export async function createUser(
  prisma: PrismaClient,
  orgId: string,
  role: Role = "member",
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

/** Session cookie header for a user, created directly in the database (no login, no rate limit). */
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
