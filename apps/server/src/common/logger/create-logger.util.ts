import { type DestinationStream, pino, type Logger } from "pino";

import { LogLevel } from "../../config/enums/log-level.enum.js";
import { currentRequestId } from "../middleware/request-id.middleware.js";

export function createLogger(
  level = process.env["LOG_LEVEL"] ?? LogLevel.INFO,
  destination?: DestinationStream,
): Logger {
  return pino(
    {
      level,
      base: { service: "intentlock-server" },
      mixin: () => {
        const requestId = currentRequestId();
        return requestId ? { requestId } : {};
      },
    },
    destination,
  );
}
