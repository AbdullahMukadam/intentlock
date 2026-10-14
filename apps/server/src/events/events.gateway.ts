import { Inject } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import { SESSION_COOKIE } from "../auth/constants/session.constants.js";
import { SessionsService } from "../auth/sessions.service.js";
import { parseCookie } from "../auth/utils/session-cookie.util.js";
import { ErrorCode } from "../common/enums/error-code.enum.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { ENV, type Env } from "../config/config.module.js";
import { EventsService } from "./events.service.js";

@WebSocketGateway({ namespace: API_ENDPOINTS.EVENTS, addTrailingSlash: false })
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly sessions: SessionsService,
    private readonly events: EventsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // Rejects the handshake itself, so an unauthenticated socket never connects.
  afterInit(namespace: Namespace) {
    namespace.use((socket, next) => {
      void this.sessions
        .resolveCookie(parseCookie(socket.handshake.headers.cookie, SESSION_COOKIE))
        .then((session) => {
          if (!session || !this.allowedOrigin(socket.handshake.headers.origin)) {
            next(new Error(ErrorCode.UNAUTHORIZED));
            return;
          }
          socket.data = { user: session.user };
          next();
        }, next);
    });
  }

  handleConnection(socket: Socket) {
    this.events.register(socket, (socket.data as { user: SessionUser }).user);
  }

  handleDisconnect(socket: Socket) {
    this.events.unregister(socket);
  }

  // Browsers always send Origin; non-browser clients (CLI, tests) do not.
  private allowedOrigin(origin: string | undefined): boolean {
    if (!origin) return true;
    const allowed = [
      new URL(this.env.PUBLIC_URL).origin,
      ...(this.env.CORS_ORIGINS?.split(",") ?? []),
    ];
    return allowed.map((o) => o.trim()).includes(origin);
  }
}
