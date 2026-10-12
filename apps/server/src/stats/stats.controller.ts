import { Controller, Get, Query } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { OverviewQueryDto } from "./dto/overview-query.dto.js";
import { StatsService } from "./stats.service.js";

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get(API_ENDPOINTS.STATS_OVERVIEW)
  overview(@CurrentUser() user: SessionUser, @Query() query: OverviewQueryDto) {
    return this.stats.overview(user, query);
  }
}
