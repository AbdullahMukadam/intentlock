import { Module } from "@nestjs/common";

import { OrgBootstrapService } from "./org-bootstrap.service.js";

@Module({ providers: [OrgBootstrapService] })
export class OrgModule {}
