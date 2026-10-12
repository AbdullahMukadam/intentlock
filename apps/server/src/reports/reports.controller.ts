import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { AgentAuth } from "../common/decorators/agent-auth.decorator.js";
import { CurrentAgent } from "../common/decorators/current-agent.decorator.js";
import type { AgentCaller } from "../common/types/auth.types.js";
import { ReportDto } from "./dto/report.dto.js";
import { ReportsService } from "./reports.service.js";

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @AgentAuth()
  @Post(API_ENDPOINTS.REPORT)
  @HttpCode(HttpStatus.OK)
  report(@CurrentAgent() agent: AgentCaller, @Body() body: ReportDto) {
    return this.reports.report(agent, body.token, body.callId, body.outcome);
  }
}
