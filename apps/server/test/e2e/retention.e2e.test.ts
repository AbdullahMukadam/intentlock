import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { generateSigningKeyPair } from "@intentlock/core";
import { CompactSign } from "jose";
import request from "supertest";

import { AuditService } from "../../src/audit/audit.service.js";
import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { ENV, type Env } from "../../src/config/config.module.js";
import { VENDOR_PUBLIC_KEY } from "../../src/license/constants/license.constants.js";
import { LicenseEdition } from "../../src/license/enums/license-edition.enum.js";
import { LicenseService } from "../../src/license/license.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  backdateEntries,
  createAgentWithKey,
  createOrg,
  createTestApp,
  planFor,
  signedIn,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
const vendor = await generateSigningKeyPair();
const dir = mkdtempSync(join(tmpdir(), "intentlock-retention-"));
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let oldPlanId: string;
const http = () => request(app.getHttpServer());

async function license(retentionDays: number | null) {
  const env = app.get<Env>(ENV);
  if (retentionDays === null) {
    env.LICENSE_FILE = undefined;
  } else {
    const jws = await new CompactSign(
      new TextEncoder().encode(
        JSON.stringify({
          licensee: "Acme",
          edition: LicenseEdition.LICENSED,
          maxUsers: 25,
          maxAgents: null,
          retentionDays,
          exp: Math.floor(Date.now() / 1000) + 365 * 86_400,
        }),
      ),
    )
      .setProtectedHeader({ alg: "EdDSA" })
      .sign(vendor.privateKey);
    env.LICENSE_FILE = join(dir, `l-${String(retentionDays)}.jws`);
    writeFileSync(env.LICENSE_FILE, jws);
  }
  await app.get(LicenseService).load();
}

beforeAll(async () => {
  app = await createTestApp({
    override: (b) => b.overrideProvider(VENDOR_PUBLIC_KEY).useValue(vendor.publicKey),
  });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  const bot = await createAgentWithKey(prisma, orgId);
  const audit = app.get(AuditService);
  await audit.append(orgId, [{ kind: AuditKind.CHECK, agentId: bot.agent.id, tool: "old_tool" }]);
  await backdateEntries(prisma, [1], 40);
  const plan = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({ plan: planFor(admin.user.email, [{ tool: "new_tool" }]) })
    .expect(201);
  oldPlanId = plan.body.planId;
  await prisma.plan.update({
    where: { id: oldPlanId },
    data: { createdAt: new Date(Date.now() - 40 * 86_400_000) },
  });
  await audit.append(orgId, [{ kind: AuditKind.CHECK, agentId: bot.agent.id, tool: "new_tool" }]);
  await license(null);
});

const tools = async (query: Record<string, string> = {}) =>
  (
    await http().get("/v1/audit").query(query).set("Cookie", admin.cookie).expect(200)
  ).body.entries.map((e: { tool: string | null }) => e.tool);

describe("history window", () => {
  it("free mode hides entries and runs older than 30 days but verify still covers them", async () => {
    expect(await tools()).not.toContain("old_tool");
    expect(
      await tools({ from: new Date(Date.now() - 60 * 86_400_000).toISOString() }),
    ).not.toContain("old_tool");
    const exported = await http()
      .get("/v1/audit")
      .query({ format: "jsonl" })
      .set("Cookie", admin.cookie)
      .expect(200);
    expect(exported.text).not.toContain("old_tool");
    const runs = await http().get("/v1/runs").set("Cookie", admin.cookie).expect(200);
    expect(runs.body.runs.map((r: { planId: string }) => r.planId)).not.toContain(oldPlanId);
    await http().get(`/v1/runs/${oldPlanId}`).set("Cookie", admin.cookie).expect(404);
    const verify = await http().get("/v1/audit/verify").set("Cookie", admin.cookie).expect(200);
    expect(verify.body).toMatchObject({ ok: true });
    expect(verify.body.count).toBe(
      await prisma.auditEntry.count({ where: { kind: { not: "audit_verified" } } }),
    );
  });

  it("a license with longer retention shows the older history again", async () => {
    await license(365);
    expect(await tools()).toContain("old_tool");
    const runs = await http().get("/v1/runs").set("Cookie", admin.cookie).expect(200);
    expect(runs.body.runs.map((r: { planId: string }) => r.planId)).toContain(oldPlanId);
    await http().get(`/v1/runs/${oldPlanId}`).set("Cookie", admin.cookie).expect(200);
  });

  it("nothing is deleted when history is hidden", async () => {
    expect(await prisma.auditEntry.count({ where: { tool: "old_tool" } })).toBe(1);
  });
});
