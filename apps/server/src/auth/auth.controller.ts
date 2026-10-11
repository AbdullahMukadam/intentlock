import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Public } from "../common/decorators/public.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { ENV, type Env } from "../config/config.module.js";
import { AuthService } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { clearSessionCookie, setSessionCookie } from "./utils/session-cookie.util.js";

@Controller("v1")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post("auth/login")
  @HttpCode(200)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { cookie, user } = await this.auth.login(body.email, body.token, req.ip);
    setSessionCookie(res, cookie, this.secure);
    return { user };
  }

  @Post("auth/logout")
  @HttpCode(204)
  async logout(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user.orgId, user.id, user.sessionId);
    clearSessionCookie(res, this.secure);
  }

  @Get("me")
  me(@CurrentUser() user: SessionUser) {
    return { email: user.email, role: user.role, groups: user.groups };
  }

  private get secure() {
    return this.env.PUBLIC_URL.startsWith("https:");
  }
}
