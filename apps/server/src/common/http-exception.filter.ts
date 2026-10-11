import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";
import type { Logger } from "pino";

/** Known HTTP errors pass through; anything else is logged and returned as a bare 500 (no stack, no message). */
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
    res.status(500).json({ statusCode: 500, error: "internal_error" });
  }
}
