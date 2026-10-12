import { Controller, Get } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { LicensedResource } from "./enums/licensed-resource.enum.js";
import { LicenseService } from "./license.service.js";
import { toLicenseView } from "./utils/to-license-view.util.js";

@Controller()
export class LicenseController {
  constructor(
    private readonly license: LicenseService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(API_ENDPOINTS.LICENSE)
  async get(@CurrentUser() user: SessionUser) {
    const db = orgDb(this.prisma, user.orgId);
    const [users, agents] = await Promise.all([
      this.license.countActive(db, LicensedResource.USERS),
      this.license.countActive(db, LicensedResource.AGENTS),
    ]);
    return toLicenseView(this.license.current(), users, agents);
  }
}
