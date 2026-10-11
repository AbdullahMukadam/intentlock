import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { ApiKeyGuard } from "./agents/api-keys/guards/api-key.guard.js";
import { AuditModule } from "./audit/audit.module.js";
import { SessionGuard } from "./auth/guards/session.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { CsrfGuard } from "./common/guards/csrf.guard.js";
import { RolesGuard } from "./common/guards/roles.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { OrgModule } from "./org/org.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, OrgModule, AuthModule, UsersModule],
  // Global guards run in this order; SessionGuard is the default deny.
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
