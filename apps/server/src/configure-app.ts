import type { INestApplication } from "@nestjs/common";

import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { createLogger, PinoLogger } from "./common/logger.js";
import { ZodValidationPipe } from "./common/zod-validation.pipe.js";

/** Shared by main.ts and the e2e tests so both run the same app. */
export function configureApp(app: INestApplication) {
  const log = createLogger();
  app.useLogger(new PinoLogger(log));
  app.useGlobalFilters(new HttpExceptionFilter(log));
  app.useGlobalPipes(new ZodValidationPipe());
  return app;
}
