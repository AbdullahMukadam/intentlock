import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { INestApplication } from "@nestjs/common";
import { generateSigningKeyPair } from "@intentlock/core";
import { CompactSign } from "jose";
import request from "supertest";

import { ENV, type Env } from "../../src/config/config.module.js";
import { VENDOR_PUBLIC_KEY } from "../../src/license/constants/license.constants.js";
import { LicenseEdition } from "../../src/license/enums/license-edition.enum.js";
import { LicenseFeature } from "../../src/license/enums/license-feature.enum.js";
import { LicenseStatus } from "../../src/license/enums/license-status.enum.js";
import { LicenseService } from "../../src/license/license.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  CSRF,
  planFor,
  signedIn,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
const dir = mkdtempSync(join(tmpdir(), "intentlock-license-"));
const vendor = await generateSigningKeyPair();
const stranger = await generateSigningKeyPair();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;

const TEAM = {
  licensee: "Acme",
  edition: LicenseEdition.TEAM,
  maxUsers: 25,
  maxAgents: 10,
  retentionDays: 90,
  features: [LicenseFeature.MULTI_INSTANCE],
};

async function useLicense(
  payload: object | null,
  key: CryptoKey = vendor.privateKey,
  raw?: string,
) {
  const env = app.get<Env>(ENV);
  if (payload === null && raw === undefined) {
    env.LICENSE_FILE = undefined;
  } else {
    const file = join(dir, `license-${Math.random().toString(36).slice(2)}.jws`);
    const jws =
      raw ??
      (await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
        .setProtectedHeader({ alg: "EdDSA" })
        .sign(key));
    writeFileSync(file, jws);
    env.LICENSE_FILE = file;
  }
  const license = app.get(LicenseService);
  await license.load();
  return license;
}

const inOneYear = () => Math.floor(Date.now() / 1000) + 365 * 86_400;
const http = () => request(app.getHttpServer());

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
  await useLicense(null);
});

describe("license verification", () => {
  it("falls back to Community without a license file", async () => {
    const res = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({
      edition: "community",
      maxUsers: 5,
      usedUsers: 1,
      maxAgents: 3,
      usedAgents: 0,
      expiresAt: null,
    });
  });

  it("applies a valid license", async () => {
    const license = await useLicense({ ...TEAM, exp: inOneYear() });
    expect(license.currentStatus()).toBe(LicenseStatus.VALID);
    expect(license.hasFeature(LicenseFeature.MULTI_INSTANCE)).toBe(true);
    expect(license.hasFeature(LicenseFeature.SSO)).toBe(false);
    const res = await http().get("/v1/license").set("Cookie", admin.cookie).expect(200);
    expect(res.body).toMatchObject({ edition: "team", licensee: "Acme", maxAgents: 10 });
    expect(res.body.expiresAt).toMatch(/^\d{4}-/);
  });

  it("falls back to Community when expired, badly signed or unreadable", async () => {
    const cases: [object | null, CryptoKey | undefined, string | undefined, LicenseStatus][] = [
      [
        { ...TEAM, exp: Math.floor(Date.now() / 1000) - 1 },
        undefined,
        undefined,
        LicenseStatus.EXPIRED,
      ],
      [{ ...TEAM, exp: inOneYear() }, stranger.privateKey, undefined, LicenseStatus.INVALID],
      [null, undefined, "not a jws", LicenseStatus.INVALID],
      [
        { ...TEAM, exp: inOneYear(), edition: "platinum" },
        undefined,
        undefined,
        LicenseStatus.INVALID,
      ],
    ];
    for (const [payload, key, raw, status] of cases) {
      const license = await useLicense(payload, key, raw);
      expect(license.currentStatus()).toBe(status);
      expect(license.current().edition).toBe(LicenseEdition.COMMUNITY);
    }
  });
});

describe("license limits", () => {
  const createAgent = (name: string) =>
    http().post("/v1/agents").set("Cookie", admin.cookie).set(CSRF).send({ name });

  it("enforces maxAgents; disabling an agent frees a seat; re-enabling at the limit fails", async () => {
    for (const name of ["a1", "a2", "a3"]) await createAgent(name).expect(201);
    const over = await createAgent("a4").expect(403);
    expect(over.body).toMatchObject({ error: "agent_limit_reached", max: 3 });

    const a1 = await prisma.agent.findFirstOrThrow({ where: { name: "a1" } });
    await http().delete(`/v1/agents/${a1.id}`).set("Cookie", admin.cookie).set(CSRF).expect(200);
    await createAgent("a4").expect(201);
    await http()
      .patch(`/v1/agents/${a1.id}`)
      .set("Cookie", admin.cookie)
      .set(CSRF)
      .send({ disabled: false })
      .expect(403);
  });

  it("enforces maxUsers (the admin counts)", async () => {
    const add = (email: string) =>
      http()
        .post("/v1/users")
        .set("Cookie", admin.cookie)
        .set(CSRF)
        .send({ email, role: UserRole.MEMBER });
    for (let i = 0; i < 4; i++) await add(`u${i}@test.dev`).expect(201);
    const over = await add("u5@test.dev").expect(403);
    expect(over.body).toMatchObject({ error: "user_limit_reached", max: 5 });
  });

  it("concurrent creates cannot overshoot the limit", async () => {
    const results = await Promise.all(["c1", "c2", "c3", "c4", "c5"].map((n) => createAgent(n)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 403)).toHaveLength(2);
  });

  it("a valid license raises the limit", async () => {
    await useLicense({ ...TEAM, exp: inOneYear() });
    for (const name of ["a1", "a2", "a3", "a4"]) await createAgent(name).expect(201);
  });
});

describe("license never changes enforcement", () => {
  it("an expired license yields exactly the same decisions as a valid one", async () => {
    const bot = await createAgentWithKey(prisma, orgId);
    const calls = [
      call("github_list_issues", { repo: "acme/app" }),
      call("github_list_issues", { repo: "acme/private" }),
      call("github_create_pull_request"),
    ];
    const decide = async () => {
      const plan = await http()
        .post("/v1/plans")
        .set(bot.auth)
        .send({
          plan: planFor(admin.user.email, [
            { tool: "github_list_issues", args: { repo: { eq: "acme/app" } } },
          ]),
        })
        .expect(201);
      const out = [];
      for (const c of calls) {
        const res = await http()
          .post("/v1/check")
          .set(bot.auth)
          .send({ token: plan.body.token, call: c })
          .expect(200);
        out.push(res.body);
      }
      return out;
    };
    await useLicense({ ...TEAM, exp: inOneYear() });
    const valid = await decide();
    await useLicense({ ...TEAM, exp: Math.floor(Date.now() / 1000) - 1 });
    const expired = await decide();
    expect(expired).toEqual(valid);
    expect(valid.map((d) => d.verdict)).toEqual(["allow", "block", "block"]);
  });
});
