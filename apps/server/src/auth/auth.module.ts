import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionsService } from "./sessions.service.js";
import { LoginThrottler } from "./enums/login-throttler.enum.js";

const MINUTE = 60_000;

@Module({
  imports: [
    // In-memory store, so these limits are per instance (ADR-032).
    ThrottlerModule.forRoot([
      {
        name: LoginThrottler.IP,
        ttl: MINUTE,
        limit: 20,
        getTracker: (req) => String(req["ip"] ?? "unknown"),
      },
      {
        name: LoginThrottler.EMAIL,
        ttl: MINUTE,
        limit: 5,
        getTracker: (req) => {
          const email: unknown = (req["body"] as { email?: unknown } | undefined)?.email;
          return typeof email === "string" ? email.trim().toLowerCase() : "";
        },
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionsService],
  exports: [SessionsService],
})
export class AuthModule {}
