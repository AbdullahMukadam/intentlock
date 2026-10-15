import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";
import { loadEnv } from "./config/env.schema.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

const env = loadEnv();
const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
configureApp(app);
app.set("trust proxy", env.TRUST_PROXY);
app.enableShutdownHooks();
await app.listen(env.PORT);
