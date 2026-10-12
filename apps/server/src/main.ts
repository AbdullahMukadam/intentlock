import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { configureApp } from "./configure-app.js";
import { loadEnv } from "./config/env.schema.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

const env = loadEnv();
const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);
app.enableShutdownHooks();
await app.listen(env.PORT);
