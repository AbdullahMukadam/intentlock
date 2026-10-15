import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { API_ENDPOINTS } from "@intentlock/core";

import { Public } from "../../common/decorators/public.decorator.js";
import { ENV, type Env } from "../../config/config.module.js";
import { SESSION_COOKIE } from "../constants/session.constants.js";
import { LoginThrottler } from "../enums/login-throttler.enum.js";
import { requestMeta } from "../utils/request-meta.util.js";
import { readCookie, setSessionCookie } from "../utils/session-cookie.util.js";
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS } from "./constants/oauth.constants.js";
import { OAuthCallbackQueryDto } from "./dto/oauth-callback-query.dto.js";
import { OAuthProviderParamsDto } from "./dto/oauth-provider-params.dto.js";
import { OAuthStartQueryDto } from "./dto/oauth-start-query.dto.js";
import { OAuthService } from "./oauth.service.js";

@Public()
@UseGuards(ThrottlerGuard)
@SkipThrottle({ [LoginThrottler.EMAIL]: true })
@Controller()
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(API_ENDPOINTS.AUTH_OAUTH_START)
  async start(
    @Param() { provider }: OAuthProviderParamsDto,
    @Query() query: OAuthStartQueryDto,
    @Res() res: Response,
  ) {
    const { url, cookie } = await this.oauth.start(provider, query.mode, query.invite);
    res.cookie(OAUTH_STATE_COOKIE, cookie, {
      ...this.cookieOptions,
      maxAge: OAUTH_STATE_TTL_SECONDS * 1000,
    });
    res.redirect(HttpStatus.FOUND, url);
  }

  @Get(API_ENDPOINTS.AUTH_OAUTH_CALLBACK)
  async callback(
    @Param() { provider }: OAuthProviderParamsDto,
    @Query() query: OAuthCallbackQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.oauth.callback(
      provider,
      query,
      readCookie(req, OAUTH_STATE_COOKIE),
      readCookie(req, SESSION_COOKIE),
      requestMeta(req),
    );
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieOptions);
    if (result.session) setSessionCookie(res, result.session, this.cookieOptions.secure);
    res.redirect(HttpStatus.FOUND, result.redirect);
  }

  private get cookieOptions() {
    return {
      httpOnly: true,
      secure: this.env.PUBLIC_URL.startsWith("https:"),
      sameSite: "lax" as const,
      path: "/",
    };
  }
}
