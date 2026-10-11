import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";

import { AgentAuth } from "../common/decorators/agent-auth.decorator.js";
import { CurrentAgent } from "../common/decorators/current-agent.decorator.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { CheckService } from "./check.service.js";
import { CheckCallDto } from "./dto/check-call.dto.js";

@Controller("v1/check")
export class CheckController {
  constructor(private readonly checks: CheckService) {}

  @AgentAuth()
  @Post()
  @HttpCode(HttpStatus.OK)
  check(@CurrentAgent() agent: AgentCaller, @Body() body: CheckCallDto) {
    return this.checks.check(agent, body.token, body.call);
  }
}
