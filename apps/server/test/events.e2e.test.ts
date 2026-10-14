import type { AddressInfo } from "node:net";

import type { INestApplication } from "@nestjs/common";
import { io, type Socket } from "socket.io-client";
import request from "supertest";

import { EventName } from "../src/events/enums/event-name.enum.js";
import { EventsService } from "../src/events/events.service.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";
import {
  call,
  createAgentWithKey,
  createOrg,
  createTestApp,
  CSRF,
  planFor,
  publish,
  signedIn,
} from "./helpers.js";
import { resetDb, testPrisma } from "./setup.js";

const POLICY = `version: 1
default: block
rules:
  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver] }
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
`;

const prisma = testPrisma();
let app: INestApplication;
let url: string;
let orgId: string;
let admin: Awaited<ReturnType<typeof signedIn>>;
let approver: Awaited<ReturnType<typeof signedIn>>;
let alice: Awaited<ReturnType<typeof signedIn>>;
let bob: Awaited<ReturnType<typeof signedIn>>;
let bot: Awaited<ReturnType<typeof createAgentWithKey>>;
const sockets: Socket[] = [];

beforeAll(async () => {
  app = await createTestApp();
  await app.listen(0);
  url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/events`;
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
  alice = await signedIn(prisma, orgId, UserRole.MEMBER);
  bob = await signedIn(prisma, orgId, UserRole.MEMBER);
  bot = await createAgentWithKey(prisma, orgId);
  await publish(app, bot.agent.id, admin.cookie, POLICY);
});
afterEach(() => {
  for (const s of sockets.splice(0)) s.disconnect();
});

const http = () => request(app.getHttpServer());

function connect(
  headers: Record<string, string> = {},
): Promise<{ socket: Socket; events: [string, unknown][] }> {
  const socket = io(url, { transports: ["websocket"], extraHeaders: headers, reconnection: false });
  sockets.push(socket);
  const events: [string, unknown][] = [];
  socket.onAny((name: string, payload: unknown) => events.push([name, payload]));
  return new Promise((resolve, reject) => {
    socket.on("connect", () => resolve({ socket, events }));
    socket.on("connect_error", reject);
  });
}

const settle = () => new Promise((r) => setTimeout(r, 200));

async function commentAs(user: string) {
  const plan = await http()
    .post("/v1/plans")
    .set(bot.auth)
    .send({ plan: planFor(user, [{ tool: "github_post_comment" }]) })
    .expect(201);
  const res = await http()
    .post("/v1/check")
    .set(bot.auth)
    .send({ token: plan.body.token, call: call("github_post_comment") })
    .expect(200);
  return res.body.holdId as string;
}

describe("/events", () => {
  it("refuses a handshake without a valid session or from a foreign origin", async () => {
    await expect(connect()).rejects.toThrow("unauthorized");
    await expect(connect({ cookie: "il_session=forged" })).rejects.toThrow("unauthorized");
    await expect(connect({ cookie: admin.cookie, origin: "https://evil.example" })).rejects.toThrow(
      "unauthorized",
    );
  });

  it("accepts the handshake path without a trailing slash, as Next.js rewrites send it", async () => {
    const socket = io(url, {
      transports: ["polling"],
      addTrailingSlash: false,
      extraHeaders: { cookie: admin.cookie },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", reject);
    });
    expect(socket.connected).toBe(true);
  });

  it("streams decisions and holds, filtered by role", async () => {
    const forApprover = await connect({ cookie: approver.cookie });
    const forAlice = await connect({ cookie: alice.cookie });
    const forBob = await connect({ cookie: bob.cookie });
    const holdId = await commentAs(alice.user.email);
    await settle();
    expect(forApprover.events.map(([n]) => n)).toEqual([
      EventName.DECISION,
      EventName.HOLD_CREATED,
    ]);
    expect(forApprover.events[1]?.[1]).toMatchObject({
      holdId,
      user: alice.user.email,
      tool: "github_post_comment",
    });
    expect(forAlice.events.map(([n]) => n)).toEqual([EventName.DECISION, EventName.HOLD_CREATED]);
    expect(forBob.events).toEqual([]);

    await http()
      .post(`/v1/holds/${holdId}/approve`)
      .set("Cookie", approver.cookie)
      .set(CSRF)
      .send({})
      .expect(200);
    await settle();
    expect(forAlice.events.at(-1)).toEqual([
      EventName.HOLD_RESOLVED,
      { holdId, status: "approved" },
    ]);
    expect(forBob.events).toEqual([]);
  });

  it("drops the socket of a user who gets disabled", async () => {
    const { socket } = await connect({ cookie: bob.cookie });
    const closed = new Promise((r) => socket.on("disconnect", r));
    await prisma.user.update({ where: { id: bob.user.id }, data: { disabledAt: new Date() } });
    await app.get(EventsService).recheckSessions();
    await closed;
    expect(socket.connected).toBe(false);
  });
});
