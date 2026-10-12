import { Controller, Get, Param, Query } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { ListRunsQueryDto } from "./dto/list-runs-query.dto.js";
import { RunParamsDto } from "./dto/run-params.dto.js";
import { RunsService } from "./runs.service.js";

@Controller("v1/runs")
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() query: ListRunsQueryDto) {
    return this.runs.list(user, query);
  }

  @Get(":planId")
  get(@CurrentUser() user: SessionUser, @Param() { planId }: RunParamsDto) {
    return this.runs.get(user, planId);
  }
}
