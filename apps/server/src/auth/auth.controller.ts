import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { ENV, type Env } from "../config/config.module.js";
import { AuthService } from "./auth.service.js";
import { ForgotPasswordDto } from "./dto/forgot-password.dto.js";
import { LoginDto } from "./dto/login.dto.js";
import { ResetPasswordDto } from "./dto/reset-password.dto.js";
import { LoginThrottler } from "./enums/login-throttler.enum.js";
import { requestMeta } from "./utils/request-meta.util.js";
import { clearSessionCookie, setSessionCookie } from "./utils/session-cookie.util.js";

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get(API_ENDPOINTS.AUTH_METHODS)
  methods() {
    return this.auth.methods();
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post(API_ENDPOINTS.AUTH_LOGIN)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { cookie, user } = await this.auth.login(body, requestMeta(req));
    setSessionCookie(res, cookie, this.secure);
    return { user };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post(API_ENDPOINTS.AUTH_PASSWORD_FORGOT)
  @HttpCode(HttpStatus.ACCEPTED)
  async forgot(@Body() body: ForgotPasswordDto, @Req() req: Request) {
    await this.auth.forgotPassword(body.email, requestMeta(req));
    return { ok: true };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [LoginThrottler.EMAIL]: true })
  @Post(API_ENDPOINTS.AUTH_PASSWORD_RESET)
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body() body: ResetPasswordDto, @Req() req: Request) {
    await this.auth.resetPassword(body.token, body.password, requestMeta(req));
  }

  @Post(API_ENDPOINTS.AUTH_LOGOUT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.orgId, user.id, user.sessionId);
    clearSessionCookie(res, this.secure);
  }

  @Get(API_ENDPOINTS.ME)
  me(@CurrentUser() user: SessionUser) {
    return { email: user.email, role: user.role, groups: user.groups };
  }

  private get secure() {
    return this.env.PUBLIC_URL.startsWith("https:");
  }
}
