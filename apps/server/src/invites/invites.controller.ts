import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { CreateInviteDto } from "./dto/create-invite.dto.js";
import { InviteIdParamsDto } from "./dto/invite-id-params.dto.js";
import { InvitesService } from "./invites.service.js";

@Roles(UserRole.ADMIN)
@Controller()
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post(API_ENDPOINTS.INVITES)
  create(@CurrentUser() admin: SessionUser, @Body() body: CreateInviteDto) {
    return this.invites.create(admin, body);
  }

  @Get(API_ENDPOINTS.INVITES)
  list(@CurrentUser() admin: SessionUser) {
    return this.invites.list(admin.orgId);
  }

  @Post(API_ENDPOINTS.INVITE_RESEND)
  resend(@CurrentUser() admin: SessionUser, @Param() { id }: InviteIdParamsDto) {
    return this.invites.resend(admin, id);
  }

  @Delete(API_ENDPOINTS.INVITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(@CurrentUser() admin: SessionUser, @Param() { id }: InviteIdParamsDto) {
    await this.invites.revoke(admin, id);
  }
}
