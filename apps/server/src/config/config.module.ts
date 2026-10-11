import { Global, Module } from "@nestjs/common";

import { Env, loadEnv } from "./env.schema.js";

export const ENV = Symbol("ENV");
export type { Env };

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
