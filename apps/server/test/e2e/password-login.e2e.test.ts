import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  cookieOf,
  createOrg,
  createTestApp,
  createUser,
  createUserWithPassword,
  CSRF,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const prisma = testPrisma();
let app: INestApplication;
let orgId: string;

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
});

const http = () => request(app.getHttpServer());

describe("password sign-in", () => {
  const signIn = (email: string, password: string) =>
    http().post("/v1/auth/login").set(CSRF).set("User-Agent", "vitest").send({ email, password });

  it("signs in with email + password and records the session's ip and user agent", async () => {
    const { user, password } = await createUserWithPassword(prisma, orgId, UserRole.APPROVER);
    const res = await signIn(user.email, password).expect(200);
    expect(res.body.user).toEqual({ email: user.email, role: UserRole.APPROVER, groups: [] });
    await http().get("/v1/me").set("Cookie", cookieOf(res)).expect(200);
    const [session] = await prisma.session.findMany({ where: { userId: user.id } });
    expect(session).toMatchObject({ userAgent: "vitest" });
    expect(session!.ip).toBeTruthy();
    const audit = await prisma.auditEntry.findFirst({ where: { kind: AuditKind.AUTH_LOGIN } });
    expect(audit!.payload).toMatchObject({ email: user.email, method: "password" });
  });

  it("gives the same 401 for a wrong password, unknown email, disabled user and no password", async () => {
    const { user, password } = await createUserWithPassword(prisma, orgId);
    const { user: tokenOnly } = await createUser(prisma, orgId);
    const wrong = await signIn(user.email, "wrong password here").expect(401);
    const unknown = await signIn("ghost@test.dev", password).expect(401);
    const noPassword = await signIn(tokenOnly.email, password).expect(401);
    expect(wrong.body).toEqual({ statusCode: 401, error: "invalid_credentials" });
    expect(unknown.body).toEqual(wrong.body);
    expect(noPassword.body).toEqual(wrong.body);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    await signIn(user.email, password).expect(401);
  });

  it("refuses a body with both a password and a token", async () => {
    const { user, token } = await createUser(prisma, orgId);
    await http()
      .post("/v1/auth/login")
      .set(CSRF)
      .send({ email: user.email, token, password: "something long enough" })
      .expect(400);
  });
});
