import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";

import { ENV, type Env } from "../config/config.module.js";
import { PrismaClient } from "../generated/prisma/client.js";

// Unscoped: services go through orgDb(); only bootstrap, guards and raw SQL use this directly.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
