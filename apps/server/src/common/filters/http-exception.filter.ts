import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import type { Logger } from "pino";

import { ErrorCode } from "../enums/error-code.enum.js";

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
    this.log.error({ err: exception }, "unhandled error");
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: ErrorCode.INTERNAL_ERROR });
  }
}
