import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { orgDb } from "../org/utils/org-db.util.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { ApplyLicenseDto } from "./dto/apply-license.dto.js";
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
  get(@CurrentUser() user: SessionUser) {
    return this.view(user.orgId);
  }

  @Roles(UserRole.ADMIN)
  @Put(API_ENDPOINTS.LICENSE)
  async apply(@CurrentUser() admin: SessionUser, @Body() body: ApplyLicenseDto) {
    await this.license.applyKey(admin, body.key);
    return this.view(admin.orgId);
  }

  @Roles(UserRole.ADMIN)
  @Delete(API_ENDPOINTS.LICENSE)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() admin: SessionUser) {
    return this.license.removeKey(admin);
  }

  private async view(orgId: string) {
    const db = orgDb(this.prisma, orgId);
    const [users, agents] = await Promise.all([
      this.license.countActive(db, LicensedResource.USERS),
      this.license.countActive(db, LicensedResource.AGENTS),
    ]);
    return toLicenseView(
      this.license.current(),
      this.license.currentStatus(),
      this.license.currentSource(),
      users,
      agents,
    );
  }
}
