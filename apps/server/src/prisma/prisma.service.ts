import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { recordDbQuery } from "../common/middleware/server-timing.middleware.js";
import { ENV, type Env } from "../config/config.module.js";
import { type Prisma, PrismaClient } from "../generated/prisma/client.js";

type PrismaOptions = Prisma.PrismaClientOptions & { log: [{ emit: "event"; level: "query" }] };

// Unscoped: services go through orgDb(); only bootstrap, guards and raw SQL use this directly.
@Injectable()
export class PrismaService extends PrismaClient<PrismaOptions> implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: env.DATABASE_POOL_MAX,
        connectionTimeoutMillis: env.DATABASE_POOL_TIMEOUT_MS,
      }),
      transactionOptions: {
        maxWait: env.DATABASE_TX_MAX_WAIT_MS,
        timeout: env.DATABASE_TX_TIMEOUT_MS,
      },
      log: [{ emit: "event", level: "query" }],
    });
    this.$on("query", (event) => recordDbQuery(event.duration));
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
