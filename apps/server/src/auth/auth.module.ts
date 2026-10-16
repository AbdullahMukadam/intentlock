import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";

import { ENV, type Env } from "../config/config.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { SessionsService } from "./sessions.service.js";
import { LoginThrottler } from "./enums/login-throttler.enum.js";
import { OAUTH_PROVIDERS } from "./oauth/constants/oauth.constants.js";
import { oauthProvidersFromEnv } from "./oauth/utils/oauth-providers.util.js";

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
  providers: [
    AuthService,
    SessionsService,
    {
      provide: OAUTH_PROVIDERS,
      inject: [ENV],
      useFactory: (env: Env) => oauthProvidersFromEnv(env),
    },
  ],
  exports: [SessionsService, OAUTH_PROVIDERS],
})
export class AuthModule {}
