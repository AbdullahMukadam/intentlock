import { Controller, Get, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { Public } from "../common/decorators/public.decorator.js";
import { ErrorCode } from "../common/enums/error-code.enum.js";
import { KeysService } from "../keys/keys.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: KeysService,
  ) {}

  @Public()
  @Get(API_ENDPOINTS.HEALTH)
  live() {
    return { ok: true };
  }

  @Public()
  @Get(API_ENDPOINTS.HEALTH_READY)
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw notReady();
    }
    if (!this.keys.isReady()) throw notReady();
    return { ok: true };
  }
}

function notReady() {
  return new ServiceUnavailableException({
    statusCode: HttpStatus.SERVICE_UNAVAILABLE,
    error: ErrorCode.NOT_READY,
  });
}
