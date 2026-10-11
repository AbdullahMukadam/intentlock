import { Global, Module } from "@nestjs/common";

import { AuditQueryService } from "./audit-query.service.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";
import { VerifyService } from "./verify.service.js";

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditQueryService, VerifyService],
  exports: [AuditService],
})
export class AuditModule {}
