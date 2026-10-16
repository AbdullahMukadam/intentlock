import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AccountModule } from "./account/account.module.js";
import { AgentsModule } from "./agents/agents.module.js";
import { ApiKeysModule } from "./agents/api-keys/api-keys.module.js";
import { ApiKeyGuard } from "./agents/api-keys/guards/api-key.guard.js";
import { AuditModule } from "./audit/audit.module.js";
import { SessionGuard } from "./auth/guards/session.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { OAuthModule } from "./auth/oauth/oauth.module.js";
import { CsrfGuard } from "./common/guards/csrf.guard.js";
import { RolesGuard } from "./common/guards/roles.guard.js";
import { CheckModule } from "./check/check.module.js";
import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./health/health.module.js";
import { HoldsModule } from "./holds/holds.module.js";
import { InvitesModule } from "./invites/invites.module.js";
import { KeysModule } from "./keys/keys.module.js";
import { LicenseModule } from "./license/license.module.js";
import { MailModule } from "./mail/mail.module.js";
import { OrgModule } from "./org/org.module.js";
import { PlansModule } from "./plans/plans.module.js";
import { PoliciesModule } from "./policies/policies.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { RunsModule } from "./runs/runs.module.js";
import { SetupModule } from "./setup/setup.module.js";
import { StatsModule } from "./stats/stats.module.js";
import { EventsModule } from "./events/events.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    LicenseModule,
    MailModule,
    OrgModule,
    AuthModule,
    SetupModule,
    InvitesModule,
    OAuthModule,
    AccountModule,
    UsersModule,
    AgentsModule,
    ApiKeysModule,
    PoliciesModule,
    KeysModule,
    PlansModule,
    HoldsModule,
    CheckModule,
    ReportsModule,
    HealthModule,
    RunsModule,
    StatsModule,
    EventsModule,
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
