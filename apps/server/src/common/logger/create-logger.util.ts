import { pino, type Logger } from "pino";

export function createLogger(level = process.env["LOG_LEVEL"] ?? "info"): Logger {
  return pino({ level, base: { service: "intentlock-server" } });
}
