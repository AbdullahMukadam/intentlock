import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserEmailParamsDto } from "./dto/user-email-params.dto.js";
import { UserRole } from "./enums/user-role.enum.js";
import { UsersService } from "./users.service.js";

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(API_ENDPOINTS.USERS)
  list(@CurrentUser() me: SessionUser) {
    return this.users.list(me);
  }

  @Roles(UserRole.ADMIN)
  @Patch(API_ENDPOINTS.USER)
  update(
    @CurrentUser() admin: SessionUser,
    @Param() { email }: UserEmailParamsDto,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(admin, email, body);
  }

  @Roles(UserRole.ADMIN)
  @Post(API_ENDPOINTS.USER_RESET_LINK)
  resetLink(@CurrentUser() admin: SessionUser, @Param() { email }: UserEmailParamsDto) {
    return this.users.createResetLink(admin, email);
  }
}
