import { Controller, Get, Query } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { OverviewQueryDto } from "./dto/overview-query.dto.js";
import { StatsService } from "./stats.service.js";

@Controller("v1/stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get("overview")
  overview(@CurrentUser() user: SessionUser, @Query() query: OverviewQueryDto) {
    return this.stats.overview(user, query);
  }
}
