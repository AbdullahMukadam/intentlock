import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { CreateUserDto } from "./dto/create-user.dto.js";
import { UpdateUserDto } from "./dto/update-user.dto.js";
import { UserEmailParamsDto } from "./dto/user-email-params.dto.js";
import { UserRole } from "./enums/user-role.enum.js";
import { UsersService } from "./users.service.js";

@Roles(UserRole.ADMIN)
@Controller("v1/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@CurrentUser() admin: SessionUser, @Body() body: CreateUserDto) {
    return this.users.create(admin, body);
  }

  @Get()
  list(@CurrentUser() admin: SessionUser) {
    return this.users.list(admin.orgId);
  }

  @Patch(":email")
  update(
    @CurrentUser() admin: SessionUser,
    @Param() { email }: UserEmailParamsDto,
    @Body() body: UpdateUserDto,
  ) {
    return this.users.update(admin, email, body);
  }

  @Post(":email/token")
  reissueToken(@CurrentUser() admin: SessionUser, @Param() { email }: UserEmailParamsDto) {
    return this.users.reissueToken(admin, email);
  }
}
