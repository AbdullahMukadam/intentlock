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

import { LoginThrottler } from "../auth/enums/login-throttler.enum.js";
import { requestMeta } from "../auth/utils/request-meta.util.js";
import { setSessionCookie } from "../auth/utils/session-cookie.util.js";
import { Public } from "../common/decorators/public.decorator.js";
import { ENV, type Env } from "../config/config.module.js";
import { SetupDto } from "./dto/setup.dto.js";
import { SetupService } from "./setup.service.js";

@Public()
@Controller()
export class SetupController {
  constructor(
    private readonly setupService: SetupService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get(API_ENDPOINTS.SETUP_STATUS)
  status() {
    return this.setupService.status();
  }

  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ [LoginThrottler.EMAIL]: true })
  @Post(API_ENDPOINTS.SETUP)
  @HttpCode(HttpStatus.CREATED)
  async setup(
    @Body() body: SetupDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { cookie, user } = await this.setupService.setup(body, requestMeta(req));
    setSessionCookie(res, cookie, this.env.PUBLIC_URL.startsWith("https:"));
    return { user };
  }
}
