import { Logger } from "@nestjs/common";
import type { Socket } from "socket.io";

import type { SessionsService } from "../../../src/auth/sessions.service.js";
import type { SessionUser } from "../../../src/common/types/auth.types.js";
import { EventsService } from "../../../src/events/events.service.js";

function fakeSocket() {
  return { disconnect: vi.fn(), emit: vi.fn() };
}

function user(sessionId: string) {
  return { sessionId } as SessionUser;
}

describe("EventsService.recheckSessions", () => {
  it("disconnects a socket whose session lookup fails instead of rejecting", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const resolve = vi.fn((id: string) =>
      id === "broken" ? Promise.reject(new Error("db down")) : Promise.resolve({ id }),
    );
    const events = new EventsService({ resolve } as unknown as SessionsService);
    const broken = fakeSocket();
    const healthy = fakeSocket();
    events.register(broken as unknown as Socket, user("broken"));
    events.register(healthy as unknown as Socket, user("ok"));

    await expect(events.recheckSessions()).resolves.toBeUndefined();

    expect(broken.disconnect).toHaveBeenCalledWith(true);
    expect(healthy.disconnect).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("db down"));
  });

  it("disconnects a socket whose session has ended", async () => {
    const events = new EventsService({
      resolve: () => Promise.resolve(null),
    } as unknown as SessionsService);
    const socket = fakeSocket();
    events.register(socket as unknown as Socket, user("gone"));

    await events.recheckSessions();

    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
});
