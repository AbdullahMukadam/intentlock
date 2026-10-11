import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";

import { AgentAuth } from "../common/decorators/agent-auth.decorator.js";
import { CurrentAgent } from "../common/decorators/current-agent.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AgentCaller, SessionUser } from "../common/types/auth.types.js";
import { CreateHoldDto } from "./dto/create-hold.dto.js";
import { HoldIdParamsDto } from "./dto/hold-id-params.dto.js";
import { ListHoldsQueryDto } from "./dto/list-holds-query.dto.js";
import { ResolveHoldDto } from "./dto/resolve-hold.dto.js";
import { WaitHoldQueryDto } from "./dto/wait-hold-query.dto.js";
import { HoldsService } from "./holds.service.js";

@Controller("v1/holds")
export class HoldsController {
  constructor(private readonly holds: HoldsService) {}

  @AgentAuth()
  @Post()
  create(@CurrentAgent() agent: AgentCaller, @Body() body: CreateHoldDto) {
    return this.holds.createForAgent(agent, body.token, body.call, body.ruleId);
  }

  @AgentAuth()
  @Get(":id/wait")
  wait(
    @CurrentAgent() agent: AgentCaller,
    @Param() { id }: HoldIdParamsDto,
    @Query() query: WaitHoldQueryDto,
  ) {
    return this.holds.wait(agent, id, query.timeout);
  }

  @Get()
  list(@CurrentUser() user: SessionUser, @Query() query: ListHoldsQueryDto) {
    return this.holds.list(user, query.status);
  }

  // Session only: the approver is always the signed-in user, never a value from the body.
  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: SessionUser,
    @Param() { id }: HoldIdParamsDto,
    @Body() body: ResolveHoldDto,
  ) {
    return this.holds.resolve(user, id, true, body.note);
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: SessionUser,
    @Param() { id }: HoldIdParamsDto,
    @Body() body: ResolveHoldDto,
  ) {
    return this.holds.resolve(user, id, false, body.note);
  }
}
