import {
  Body,
  Controller,
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

import { LoginThrottler } from "../auth/enums/login-throttler.enum.js";
import { requestMeta } from "../auth/utils/request-meta.util.js";
import { setSessionCookie } from "../auth/utils/session-cookie.util.js";
import { Public } from "../common/decorators/public.decorator.js";
import { ENV, type Env } from "../config/config.module.js";
import { AcceptInviteDto } from "./dto/accept-invite.dto.js";
import { InviteTokenDto } from "./dto/invite-token.dto.js";
import { InvitesService } from "./invites.service.js";

@Public()
@UseGuards(ThrottlerGuard)
@SkipThrottle({ [LoginThrottler.EMAIL]: true })
@Controller()
export class InviteAcceptController {
  constructor(
    private readonly invites: InvitesService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post(API_ENDPOINTS.INVITE_LOOKUP)
  @HttpCode(HttpStatus.OK)
  lookup(@Body() body: InviteTokenDto) {
    return this.invites.lookup(body.token);
  }

  @Post(API_ENDPOINTS.INVITE_ACCEPT)
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @Body() body: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { cookie, user } = await this.invites.accept(body.token, body.password, requestMeta(req));
    setSessionCookie(res, cookie, this.env.PUBLIC_URL.startsWith("https:"));
    return { user };
  }
}
