import { Body, Controller, Param, Post } from "@nestjs/common";

import { AgentAuth } from "../common/decorators/agent-auth.decorator.js";
import { CurrentAgent } from "../common/decorators/current-agent.decorator.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { PlanIdParamsDto } from "./dto/plan-id-params.dto.js";
import { RefreshPlanDto } from "./dto/refresh-plan.dto.js";
import { SignPlanDto } from "./dto/sign-plan.dto.js";
import { PlansService } from "./plans.service.js";

@AgentAuth()
@Controller("v1/plans")
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Post()
  sign(@CurrentAgent() agent: AgentCaller, @Body() body: SignPlanDto) {
    return this.plans.sign(agent, body.plan);
  }

  @Post(":id/refresh")
  refresh(
    @CurrentAgent() agent: AgentCaller,
    @Param() { id }: PlanIdParamsDto,
    @Body() body: RefreshPlanDto,
  ) {
    return this.plans.refresh(agent, id, body.token);
  }
}
