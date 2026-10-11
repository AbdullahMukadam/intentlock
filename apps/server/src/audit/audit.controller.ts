import { Controller, Get, HttpStatus, Query, Res } from "@nestjs/common";
import type { Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { AuditQueryService } from "./audit-query.service.js";
import { JSONL_CONTENT_TYPE } from "./constants/audit.constants.js";
import { AuditQueryDto } from "./dto/audit-query.dto.js";
import { AuditFormat } from "./enums/audit-format.enum.js";
import { VerifyService } from "./verify.service.js";

@Controller("v1/audit")
export class AuditController {
  constructor(
    private readonly query: AuditQueryService,
    private readonly verifier: VerifyService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser, @Query() q: AuditQueryDto, @Res() res: Response) {
    const { cursor, limit, format, ...filter } = q;
    if (format === AuditFormat.JSON) {
      res.status(HttpStatus.OK).json(await this.query.page(user, filter, limit, cursor));
      return;
    }
    res.status(HttpStatus.OK).type(JSONL_CONTENT_TYPE);
    for await (const entry of this.query.export(user, filter))
      res.write(`${JSON.stringify(entry)}\n`);
    res.end();
  }

  @Get("verify")
  verify() {
    return this.verifier.verify();
  }
}
