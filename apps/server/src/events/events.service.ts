import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { Socket } from "socket.io";

import { SessionsService } from "../auth/sessions.service.js";
import { LoggerContext } from "../common/enums/logger-context.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { SESSION_RECHECK_MS } from "./constants/events.constants.js";
import type { EventName } from "./enums/event-name.enum.js";
import type { EventAudience } from "./types/event-audience.type.js";
import { canSeeEvent } from "./utils/can-see-event.util.js";

// ponytail: fans out to sockets on this instance only; cross-instance delivery is DEPLOYMENT §6.1 (LISTEN/NOTIFY), and the inbox also polls.
@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(LoggerContext.EVENTS);
  private readonly sockets = new Map<Socket, SessionUser>();
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly sessions: SessionsService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.recheckSessions(), SESSION_RECHECK_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  register(socket: Socket, user: SessionUser) {
    this.sockets.set(socket, user);
  }

  unregister(socket: Socket) {
    this.sockets.delete(socket);
  }

  publish(name: EventName, payload: object, audience: EventAudience) {
    for (const [socket, user] of this.sockets) {
      if (canSeeEvent(user, audience)) socket.emit(name, payload);
    }
  }

  // Disabled users and ended sessions lose their socket within one interval.
  async recheckSessions() {
    for (const [socket, user] of this.sockets) {
      let active: boolean;
      try {
        active = Boolean(await this.sessions.resolve(user.sessionId));
      } catch (err) {
        this.log.warn(
          `Session recheck failed, disconnecting the socket: ${err instanceof Error ? err.message : String(err)}`,
        );
        active = false;
      }
      if (!active) {
        this.sockets.delete(socket);
        socket.disconnect(true);
      }
    }
  }
}
