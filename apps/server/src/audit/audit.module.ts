import { Global, Module } from "@nestjs/common";

import { ENV, type Env } from "../config/config.module.js";

import { AuditQueryService } from "./audit-query.service.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";
import { BatchService } from "./batch.service.js";
import { AUDIT_ARCHIVE } from "./constants/audit.constants.js";
import { PurgeService } from "./purge.service.js";
import { archiveFromEnv } from "./utils/archive-from-env.util.js";
import { VerifyService } from "./verify.service.js";

@Global()
@Module({
  controllers: [AuditController],
  providers: [
    AuditService,
    AuditQueryService,
    VerifyService,
    BatchService,
    PurgeService,
    { provide: AUDIT_ARCHIVE, inject: [ENV], useFactory: (env: Env) => archiveFromEnv(env) },
  ],
  exports: [AuditService],
})
export class AuditModule {}
