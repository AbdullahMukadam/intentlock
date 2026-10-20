import type { INestApplication } from "@nestjs/common";
import request from "supertest";

import { AuditKind } from "../../src/audit/enums/audit-kind.enum.js";
import { MailService } from "../../src/mail/mail.service.js";
import { UserRole } from "../../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  CSRF,
  FakeMail,
  planFor,
  publish,
  signedIn,
  verifyAuditChain,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const POLICY = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
    timeoutSeconds: 300
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const prisma = testPrisma();
const mail = new FakeMail();
let app: INestApplication;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let approver: Awaited<ReturnType<typeof signedIn>>;
let requester: Awaited<ReturnType<typeof signedIn>>;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;

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
  admin = await signedIn(prisma, orgId, UserRole.ADMIN);
  approver = await signedIn(prisma, orgId, UserRole.APPROVER);
  requester = await signedIn(prisma, orgId, UserRole.MEMBER);
  bot = await createAgentWithKey(prisma, orgId);
  mail.sent = [];
  mail.fail = false;
});

const http = () => request(app.getHttpServer());

async function heldCall() {
  await publish(app, bot.agent.id, admin.cookie, POLICY);
  const plan = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({ plan: planFor(requester.user.email, [{ tool: "github_post_comment" }]) })
    .expect(201);
  const res = await http()
    .post("/v1/check")
    .set(bot.auth)
    .send({ token: plan.body.token, call: call("github_post_comment", { body: "hi" }) })
    .expect(200);
  expect(res.body).toMatchObject({ verdict: "hold" });
  return res.body.holdId as string;
}

describe("hold notifications", () => {
  it("emails the approvers of a new hold with a link to the inbox", async () => {
    await heldCall();
    await vi.waitFor(() => expect(mail.sent).toHaveLength(1));
    expect(mail.sent[0]).toMatchObject({
      to: approver.user.email,
      subject: "Approval needed: github_post_comment from bot",
    });
    expect(mail.sent[0]?.text).toContain('Arguments: {"body":"hi"}');
  });

  it("skips approvers who turned hold emails off", async () => {
    await http()
      .patch("/v1/account")
      .set("Cookie", approver.cookie)
      .set(CSRF)
      .send({ holdEmails: false })
      .expect(200)
      .expect((r) => expect(r.body).toMatchObject({ holdEmails: false }));
    const holdId = await heldCall();
    await new Promise((r) => setTimeout(r, 300));
    expect(mail.sent).toHaveLength(0);
    expect(await prisma.hold.findUnique({ where: { id: holdId } })).toMatchObject({
      status: "PENDING",
    });
  });

  it("a failed send leaves the hold pending and is audited after one retry", async () => {
    mail.fail = true;
    const holdId = await heldCall();
    expect(await prisma.hold.findUnique({ where: { id: holdId } })).toMatchObject({
      status: "PENDING",
    });
    await vi.waitFor(
      async () => {
        const entry = await prisma.auditEntry.findFirst({
          where: { kind: AuditKind.HOLD_NOTIFY_FAILED },
        });
        expect(entry?.payload).toMatchObject({ holdId, channel: "email" });
      },
      { timeout: 10_000, interval: 200 },
    );
    expect(await prisma.hold.findUnique({ where: { id: holdId } })).toMatchObject({
      status: "PENDING",
    });
    await verifyAuditChain(prisma);
  }, 15_000);

  it("rejects an unknown account field", async () => {
    await http()
      .patch("/v1/account")
      .set("Cookie", approver.cookie)
      .set(CSRF)
      .send({ holdEmails: false, role: "admin" })
      .expect(400);
  });
});
