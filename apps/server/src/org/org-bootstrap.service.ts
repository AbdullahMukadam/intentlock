import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { LoggerContext } from "../common/enums/logger-context.enum.js";
import { ENV, type Env } from "../config/config.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { bootstrapOrg } from "./utils/bootstrap-org.util.js";

@Injectable()
export class OrgBootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger(LoggerContext.BOOTSTRAP);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async onApplicationBootstrap() {
    const result = await bootstrapOrg(this.prisma, { orgName: this.env.ORG_NAME });
    if (!result) return;
    this.log.warn(
      `One-time setup code: ${result.setupCode} (open ${this.env.PUBLIC_URL}/setup to create the first admin)`,
    );
  }
}
