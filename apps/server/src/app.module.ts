import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { SessionGuard } from "./common/session.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { OrgModule } from "./org/org.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [ConfigModule, PrismaModule, AuditModule, OrgModule, AuthModule, UsersModule],
  providers: [{ provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule {}
