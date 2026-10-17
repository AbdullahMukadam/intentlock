import type { INestApplication } from "@nestjs/common";

import { HttpExceptionFilter } from "./common/filters/http-exception.filter.js";
import { createLogger } from "./common/logger/create-logger.util.js";
import { PinoLogger } from "./common/logger/pino-logger.service.js";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware.js";
import { serverTimingMiddleware } from "./common/middleware/server-timing.middleware.js";
import { ZodValidationPipe } from "./common/pipes/zod-validation.pipe.js";

export function configureApp(app: INestApplication) {
  app.use(serverTimingMiddleware);
  app.use(requestIdMiddleware);
  const log = createLogger();
  app.useLogger(new PinoLogger(log));
  app.useGlobalFilters(new HttpExceptionFilter(log));
  app.useGlobalPipes(new ZodValidationPipe());
  return app;
}
