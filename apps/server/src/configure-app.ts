import type { INestApplication } from "@nestjs/common";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter.js";
import { createLogger } from "./common/logger/create-logger.util.js";
import { PinoLogger } from "./common/logger/pino-logger.service.js";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe.js";

/** Shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication) {
  const log = createLogger();
  app.useLogger(new PinoLogger(log));
  app.useGlobalFilters(new HttpExceptionFilter(log));
  app.useGlobalPipes(new ZodValidationPipe());
  return app;
}
