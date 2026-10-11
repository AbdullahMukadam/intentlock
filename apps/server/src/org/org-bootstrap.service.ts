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
    const result = await bootstrapOrg(this.prisma, {
      orgName: this.env.ORG_NAME,
      adminEmail: this.env.BOOTSTRAP_ADMIN_EMAIL,
      demo: this.env.INTENTLOCK_DEMO,
    });
    if (!result) return;
    if (!result.adminId) {
      this.log.warn(
        "Organization created without an admin: set BOOTSTRAP_ADMIN_EMAIL on an empty database",
      );
    }
    for (const [email, token] of Object.entries(result.tokens)) {
      this.log.warn(`One-time login token for ${email}: ${token}`);
    }
  }
}
