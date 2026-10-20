import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { API_ENDPOINTS } from "@intentlock/core";

import { AgentAuth } from "../common/decorators/agent-auth.decorator.js";
import { CurrentAgent } from "../common/decorators/current-agent.decorator.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { AgentCaller, SessionUser } from "../common/types/auth.types.js";
import { AuditQueryService } from "./audit-query.service.js";
import { BatchService } from "./batch.service.js";
import { JSONL_CONTENT_TYPE } from "./constants/audit.constants.js";
import { AuditBatchDto } from "./dto/audit-batch.dto.js";
import { AuditQueryDto } from "./dto/audit-query.dto.js";
import { AuditFormat } from "./enums/audit-format.enum.js";
import { VerifyService } from "./verify.service.js";

@Controller()
export class AuditController {
  constructor(
    private readonly query: AuditQueryService,
    private readonly verifier: VerifyService,
    private readonly batches: BatchService,
  ) {}

  @Get(API_ENDPOINTS.AUDIT)
  async list(@CurrentUser() user: SessionUser, @Query() q: AuditQueryDto, @Res() res: Response) {
    const { cursor, page, limit, format, ...filter } = q;
    if (format === AuditFormat.JSON) {
      res
        .status(HttpStatus.OK)
        .json(
          page
            ? await this.query.numbered(user, filter, limit, page)
            : await this.query.page(user, filter, limit, cursor),
        );
      return;
    }
    res.status(HttpStatus.OK).type(JSONL_CONTENT_TYPE);
    for await (const entry of this.query.export(user, filter))
      res.write(`${JSON.stringify(entry)}\n`);
    res.end();
  }

  @AgentAuth()
  @Post(API_ENDPOINTS.AUDIT_BATCH)
  @HttpCode(HttpStatus.OK)
  batch(@CurrentAgent() agent: AgentCaller, @Body() body: AuditBatchDto) {
    return this.batches.ingest(agent, body);
  }

  @Get(API_ENDPOINTS.AUDIT_VERIFY)
  verify(@CurrentUser() user: SessionUser) {
    return this.verifier.verify(user);
  }

  @Get(API_ENDPOINTS.AUDIT_SUMMARY)
  summary() {
    return this.verifier.summary();
  }
}
