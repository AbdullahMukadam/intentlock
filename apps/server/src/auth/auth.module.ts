import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

const MINUTE = 60_000;

@Module({
  imports: [
    // Only applied to sign-in (@UseGuards(ThrottlerGuard)). In-memory, so the limit is per instance.
    ThrottlerModule.forRoot([
      { name: "ip", ttl: MINUTE, limit: 20, getTracker: (req) => String(req["ip"] ?? "unknown") },
      {
        name: "email",
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
  providers: [AuthService],
})
export class AuthModule {}
