import type { LoggerService } from "@nestjs/common";
import { pino, type Logger } from "pino";

export function createLogger(level = process.env["LOG_LEVEL"] ?? "info"): Logger {
  return pino({ level, base: { service: "intentlock-server" } });
}

/** Routes Nest's own logging through pino. */
export class PinoLogger implements LoggerService {
  constructor(private readonly pino: Logger) {}

  log(message: unknown, context?: string) {
    this.pino.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.pino.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.pino.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.pino.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.pino.trace({ context }, String(message));
  }
}
