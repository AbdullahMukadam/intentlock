import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import type { Logger } from "pino";

import { DATABASE_RETRY_AFTER_SECONDS, RETRY_AFTER_HEADER } from "../constants/http.constants.js";
import { ErrorCode } from "../enums/error-code.enum.js";
import { dbErrorStatus } from "../utils/db-error.util.js";

// Unknown errors become a bare 500 so messages and stack traces never leak.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly log: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const status = exception.getStatus();
      res
        .status(status)
        .json(typeof body === "string" ? { statusCode: status, error: body } : body);
      return;
    }
    const dbStatus = dbErrorStatus(exception);
    if (dbStatus === HttpStatus.SERVICE_UNAVAILABLE) {
      this.log.warn({ err: exception }, "database unavailable");
      res
        .set(RETRY_AFTER_HEADER, String(DATABASE_RETRY_AFTER_SECONDS))
        .status(dbStatus)
        .json({ statusCode: dbStatus, error: ErrorCode.DATABASE_UNAVAILABLE });
      return;
    }
    if (dbStatus === HttpStatus.CONFLICT) {
      res.status(dbStatus).json({ statusCode: dbStatus, error: ErrorCode.CONFLICT });
      return;
    }
    this.log.error({ err: exception }, "unhandled error");
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: ErrorCode.INTERNAL_ERROR });
  }
}
