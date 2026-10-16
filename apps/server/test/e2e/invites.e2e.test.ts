import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { MailService } from "../../src/mail/mail.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  cookieOf,
  createOrg,
  createTestApp,
  createUser,
  CSRF,
  FakeMail,
  linkToken,
  PASSWORD,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

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
  mail.fail = false;
});

const http = () => request(app.getHttpServer());

function invite(email = "new@test.dev", body: Record<string, unknown> = {}) {
  return http()
    .post("/v1/invites")
    .set("Cookie", admin)
    .set(CSRF)
    .send({ email, role: UserRole.APPROVER, groups: ["oncall"], ...body });
}

const lookup = (token: string) => http().post("/v1/invites/lookup").set(CSRF).send({ token });
const accept = (token: string, password = PASSWORD) =>
  http().post("/v1/invites/accept").set(CSRF).send({ token, password });

describe("invites", () => {
  it("creates a link once, emails it, and accepting it creates and signs in the user", async () => {
    const res = await invite("New@Test.dev").expect(201);
    expect(res.body).toMatchObject({
      invite: {
        email: "new@test.dev",
        role: UserRole.APPROVER,
        groups: ["oncall"],
        expired: false,
      },
      emailed: true,
    });
    expect(res.body.link).toMatch(/\/invite\/[\w-]{40,}$/);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: "new@test.dev" });
    expect(mail.sent[0]!.text).toContain(res.body.link);

    const token = linkToken(res.body.link);
    const info = await lookup(token).expect(200);
    expect(info.body).toMatchObject({
      email: "new@test.dev",
      role: UserRole.APPROVER,
      orgName: "Test Org",
    });

    const joined = await accept(token).expect(201);
    expect(joined.body.user).toEqual({
      email: "new@test.dev",
      role: UserRole.APPROVER,
      groups: ["oncall"],
    });
    await http().get("/v1/me").set("Cookie", cookieOf(joined)).expect(200);
    await http()
      .post("/v1/auth/login")
      .set(CSRF)
      .send({ email: "new@test.dev", password: PASSWORD })
      .expect(200);

    const reused = await accept(token).expect(400);
    expect(reused.body.error).toBe("link_invalid");
    await lookup(token).expect(400);
  });

  it("lists pending invites only and stores no plain token", async () => {
    const res = await invite().expect(201);
    await invite("other@test.dev").expect(201);
    await accept(linkToken(res.body.link)).expect(201);
    const list = await http().get("/v1/invites").set("Cookie", admin).expect(200);
    expect(list.body.map((i: { email: string }) => i.email)).toEqual(["other@test.dev"]);
    const rows = await prisma.invite.findMany();
    for (const row of rows) expect(row.tokenHash).not.toBe(linkToken(res.body.link));
  });

  it("refuses an expired invite", async () => {
    const res = await invite().expect(201);
    await prisma.invite.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await lookup(linkToken(res.body.link)).expect(400);
    await accept(linkToken(res.body.link)).expect(400);
    expect(await prisma.user.count({ where: { email: "new@test.dev" } })).toBe(0);
  });

  it("revoke kills the link; revoking twice is 404", async () => {
    const res = await invite().expect(201);
    const url = `/v1/invites/${res.body.invite.id}`;
    await http().delete(url).set("Cookie", admin).set(CSRF).expect(204);
    await accept(linkToken(res.body.link)).expect(400);
    await http().delete(url).set("Cookie", admin).set(CSRF).expect(404);
  });

  it("resend replaces the token: the old link stops working, the new one works", async () => {
    const first = await invite().expect(201);
    const resent = await http()
      .post(`/v1/invites/${first.body.invite.id}/resend`)
      .set("Cookie", admin)
      .set(CSRF)
      .expect(201);
    expect(resent.body.link).not.toBe(first.body.link);
    expect(mail.sent).toHaveLength(2);
    await accept(linkToken(first.body.link)).expect(400);
    await accept(linkToken(resent.body.link)).expect(201);
  });

  it("refuses a second pending invite and an invite for an existing user", async () => {
    await invite().expect(201);
    const dup = await invite().expect(409);
    expect(dup.body.error).toBe("invite_exists");
    const { user } = await createUser(prisma, orgId);
    const existing = await invite(user.email).expect(409);
    expect(existing.body.error).toBe("user_exists");
  });

  it("checks the user limit at accept time and leaves the invite pending", async () => {
    const res = await invite().expect(201);
    for (let i = 0; i < 4; i++) await createUser(prisma, orgId);
    const over = await accept(linkToken(res.body.link)).expect(403);
    expect(over.body.error).toBe("user_limit_reached");
    await lookup(linkToken(res.body.link)).expect(200);
  });

  it("rejects a weak password and keeps the invite usable", async () => {
    const res = await invite().expect(201);
    const weak = await accept(linkToken(res.body.link), "new-password-123").expect(400);
    expect(weak.body.error).toBe("password_too_weak");
    await accept(linkToken(res.body.link)).expect(201);
  });

  it("still returns the link when the email cannot be sent", async () => {
    mail.fail = true;
    const res = await invite().expect(201);
    expect(res.body.emailed).toBe(false);
    await accept(linkToken(res.body.link)).expect(201);
  });

  it("is admin-only", async () => {
    for (const role of [UserRole.MEMBER, UserRole.APPROVER]) {
      const { cookie } = await signedIn(prisma, orgId, role);
      await http().get("/v1/invites").set("Cookie", cookie).expect(403);
      await http()
        .post("/v1/invites")
        .set("Cookie", cookie)
        .set(CSRF)
        .send({ email: "x@test.dev", role: UserRole.ADMIN })
        .expect(403);
    }
  });

  it("audits create, resend, revoke and accept in a valid chain", async () => {
    const a = await invite().expect(201);
    const resent = await http()
      .post(`/v1/invites/${a.body.invite.id}/resend`)
      .set("Cookie", admin)
      .set(CSRF)
      .expect(201);
    const b = await invite("other@test.dev").expect(201);
    await http().delete(`/v1/invites/${b.body.invite.id}`).set("Cookie", admin).set(CSRF);
    await accept(linkToken(resent.body.link)).expect(201);
    const kinds = (await prisma.auditEntry.findMany({ orderBy: { seq: "asc" } })).map(
      (e) => e.kind,
    );
    expect(kinds).toEqual([
      AuditKind.INVITE_CREATED,
      AuditKind.INVITE_RESENT,
      AuditKind.INVITE_CREATED,
      AuditKind.INVITE_REVOKED,
      AuditKind.INVITE_ACCEPTED,
      AuditKind.AUTH_LOGIN,
    ]);
    expect((await verifyAuditChain(prisma)).ok).toBe(true);
  });
});
