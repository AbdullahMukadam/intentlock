import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { API_ENDPOINTS } from "@intentlock/core";

import { LoginThrottler } from "../auth/enums/login-throttler.enum.js";
import { OAuthProviderParamsDto } from "../auth/oauth/dto/oauth-provider-params.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { AccountService } from "./account.service.js";
import { ChangePasswordDto } from "./dto/change-password.dto.js";
import { UpdateAccountDto } from "./dto/update-account.dto.js";

@Controller()
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get(API_ENDPOINTS.ACCOUNT)
  get(@CurrentUser() me: SessionUser) {
    return this.account.get(me);
  }

  @Patch(API_ENDPOINTS.ACCOUNT)
  update(@CurrentUser() me: SessionUser, @Body() body: UpdateAccountDto) {
    return this.account.update(me, body.holdEmails);
  }

  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [LoginThrottler.EMAIL]: true })
  @Post(API_ENDPOINTS.ACCOUNT_PASSWORD)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(@CurrentUser() me: SessionUser, @Body() body: ChangePasswordDto) {
    await this.account.changePassword(me, body.currentPassword, body.newPassword);
  }

  @Get(API_ENDPOINTS.ACCOUNT_SESSIONS)
  sessions(@CurrentUser() me: SessionUser) {
    return this.account.sessions(me);
  }

  @Delete(API_ENDPOINTS.ACCOUNT_SESSIONS)
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOutOthers(@CurrentUser() me: SessionUser) {
    await this.account.signOutOthers(me);
  }

  @Delete(API_ENDPOINTS.ACCOUNT_IDENTITY)
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@CurrentUser() me: SessionUser, @Param() { provider }: OAuthProviderParamsDto) {
    await this.account.unlink(me, provider);
  }

  @Post(API_ENDPOINTS.ACCOUNT_CLI_TOKEN)
  createCliToken(@CurrentUser() me: SessionUser) {
    return this.account.createCliToken(me);
  }

  @Delete(API_ENDPOINTS.ACCOUNT_CLI_TOKEN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeCliToken(@CurrentUser() me: SessionUser) {
    await this.account.revokeCliToken(me);
  }
}
