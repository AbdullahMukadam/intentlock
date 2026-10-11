import { pino, type Logger } from "pino";

import { LogLevel } from "../../config/enums/log-level.enum.js";

export function createLogger(level = process.env["LOG_LEVEL"] ?? LogLevel.INFO): Logger {
  return pino({ level, base: { service: "intentlock-server" } });
}
