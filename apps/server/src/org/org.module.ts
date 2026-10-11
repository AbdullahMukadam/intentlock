import { Inject, Injectable, Logger, Module, type OnApplicationBootstrap } from "@nestjs/common";

import { ENV, type Env } from "../config/config.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { bootstrapOrg } from "./bootstrap.js";

@Injectable()
export class OrgBootstrap implements OnApplicationBootstrap {
  private readonly log = new Logger("Bootstrap");

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

@Module({ providers: [OrgBootstrap] })
export class OrgModule {}
