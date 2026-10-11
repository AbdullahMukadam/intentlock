import type { INestApplication } from "@nestjs/common";

import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { createLogger, PinoLogger } from "./common/logger.js";

/** Shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication) {
  const log = createLogger();
  app.useLogger(new PinoLogger(log));
  app.useGlobalFilters(new HttpExceptionFilter(log));
  return app;
}
