import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { MailService } from "../../src/mail/mail.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  createOrg,
  createTestApp,
  createUserWithPassword,
  CSRF,
  FakeMail,
  linkToken,
  sessionCookie,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const NEW_PASSWORD = "a brand new long passphrase";
const prisma = testPrisma();
const mail = new FakeMail();
let app: INestApplication;
let orgId: string;
let admin: string;

beforeAll(async () => {
  app = await createTestApp({ override: (b) => b.overrideProvider(MailService).useValue(mail) });
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb(prisma);
  orgId = await createOrg(prisma);
  admin = (await signedIn(prisma, orgId, UserRole.ADMIN)).cookie;
  mail.sent = [];
  mail.enabled = true;
  mail.fail = false;
});

const http = () => request(app.getHttpServer());
const reset = (token: string, password = NEW_PASSWORD) =>
  http().post("/v1/auth/password/reset").set(CSRF).send({ token, password });
const signIn = (email: string, password: string) =>
  http().post("/v1/auth/login").set(CSRF).send({ email, password });

async function resetLink(email: string) {
  return http().post(`/v1/users/${email}/reset-link`).set("Cookie", admin).set(CSRF).expect(201);
}

describe("admin reset links", () => {
  it("sets a new password once, ends every session, and the old password stops working", async () => {
    const { user, password } = await createUserWithPassword(prisma, orgId);
    const theirs = await sessionCookie(prisma, user);
    const res = await resetLink(user.email);
    expect(res.body).toMatchObject({ emailed: true });
    expect(res.body.link).toMatch(/\/reset\/[\w-]{40,}$/);
    expect(mail.sent[0]).toMatchObject({ to: user.email });

    await reset(linkToken(res.body.link)).expect(204);
    await http().get("/v1/me").set("Cookie", theirs).expect(401);
    await signIn(user.email, password).expect(401);
    await signIn(user.email, NEW_PASSWORD).expect(200);

    const again = await reset(linkToken(res.body.link), "yet another long passphrase").expect(400);
    expect(again.body.error).toBe("link_invalid");
  });

  it("refuses an expired link, an unknown token and a weak password", async () => {
    const { user } = await createUserWithPassword(prisma, orgId);
    const res = await resetLink(user.email);
    const weak = await reset(linkToken(res.body.link), `${user.email}-and-more`).expect(400);
    expect(weak.body.error).toBe("password_too_weak");
    await prisma.passwordReset.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await reset(linkToken(res.body.link)).expect(400);
    await reset("x".repeat(43)).expect(400);
  });

  it("refuses a link for a user disabled after it was made", async () => {
    const { user } = await createUserWithPassword(prisma, orgId);
    const res = await resetLink(user.email);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });
    await reset(linkToken(res.body.link)).expect(400);
  });

  it("is admin-only and 404 for an unknown user", async () => {
    const { cookie } = await signedIn(prisma, orgId, UserRole.APPROVER);
    await http()
      .post("/v1/users/someone@test.dev/reset-link")
      .set("Cookie", cookie)
      .set(CSRF)
      .expect(403);
    await http()
      .post("/v1/users/ghost@test.dev/reset-link")
      .set("Cookie", admin)
      .set(CSRF)
      .expect(404);
  });

  it("audits the link and the reset in a valid chain", async () => {
    const { user } = await createUserWithPassword(prisma, orgId);
    const res = await resetLink(user.email);
    await reset(linkToken(res.body.link)).expect(204);
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([AuditKind.PASSWORD_RESET_CREATED, AuditKind.PASSWORD_RESET]);
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });
});

describe("forgot password", () => {
  const forgot = (email: string) =>
    http().post("/v1/auth/password/forgot").set(CSRF).send({ email });

  it("answers the same for known and unknown emails and only mails the known one", async () => {
    const { user } = await createUserWithPassword(prisma, orgId);
    const known = await forgot(user.email).expect(202);
    const unknown = await forgot("ghost@test.dev").expect(202);
    expect(known.body).toEqual(unknown.body);
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    expect(mail.sent[0]!.to).toBe(user.email);
    const link = /https?:\/\/\S+\/reset\/[\w-]+/.exec(mail.sent[0]!.text)![0];
    await reset(linkToken(link)).expect(204);
    await signIn(user.email, NEW_PASSWORD).expect(200);
  });

  it("is off without SMTP, and the sign-in methods say so", async () => {
    await http()
      .get("/v1/auth/methods")
      .expect(200, { password: true, google: false, github: false, passwordReset: true });
    mail.enabled = false;
    const res = await forgot("ghost@test.dev").expect(404);
    expect(res.body.error).toBe("password_reset_disabled");
    const methods = await http().get("/v1/auth/methods").expect(200);
    expect(methods.body.passwordReset).toBe(false);
  });
});
