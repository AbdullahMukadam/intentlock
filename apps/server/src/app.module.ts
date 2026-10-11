import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AgentsModule } from "./agents/agents.module.js";
import { ApiKeysModule } from "./agents/api-keys/api-keys.module.js";
import { ApiKeyGuard } from "./agents/api-keys/guards/api-key.guard.js";
import { AuditModule } from "./audit/audit.module.js";
import { SessionGuard } from "./auth/guards/session.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { CsrfGuard } from "./common/guards/csrf.guard.js";
import { RolesGuard } from "./common/guards/roles.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { LicenseModule } from "./license/license.module.js";
import { OrgModule } from "./org/org.module.js";
import { PoliciesModule } from "./policies/policies.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    LicenseModule,
    OrgModule,
    AuthModule,
    UsersModule,
    AgentsModule,
    ApiKeysModule,
    PoliciesModule,
  ],
  // Global guards run in this order; SessionGuard is the default deny.
  providers: [
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
