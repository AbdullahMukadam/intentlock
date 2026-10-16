import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module.js";
import { FsErrorCode } from "./common/enums/fs-error-code.enum.js";
import { createLogger } from "./common/logger/create-logger.util.js";
import { configureApp } from "./configure-app.js";
import { loadEnv } from "./config/env.schema.js";

const crashLog = createLogger();
process.on("unhandledRejection", (reason) => {
  crashLog.fatal({ err: reason }, "unhandled rejection");
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  crashLog.fatal({ err }, "uncaught exception");
  process.exit(1);
});

try {
  process.loadEnvFile("../../.env");
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== FsErrorCode.NOT_FOUND) throw err;
}

const env = loadEnv();
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
configureApp(app);
app.set("trust proxy", env.TRUST_PROXY);
app.enableShutdownHooks();
await app.listen(env.PORT);
