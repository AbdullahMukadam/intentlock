import { Controller, Get, Param, Query } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { ListRunsQueryDto } from "./dto/list-runs-query.dto.js";
import { RunParamsDto } from "./dto/run-params.dto.js";
import { RunsService } from "./runs.service.js";

@Controller()
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get(API_ENDPOINTS.RUNS)
  list(@CurrentUser() user: SessionUser, @Query() query: ListRunsQueryDto) {
    return this.runs.list(user, query);
  }

  @Get(API_ENDPOINTS.RUN)
  get(@CurrentUser() user: SessionUser, @Param() { planId }: RunParamsDto) {
    return this.runs.get(user, planId);
  }
}
