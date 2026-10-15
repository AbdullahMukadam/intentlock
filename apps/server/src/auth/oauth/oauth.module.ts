import { Module } from "@nestjs/common";

import { InvitesModule } from "../../invites/invites.module.js";
import { AuthModule } from "../auth.module.js";
import { OAuthController } from "./oauth.controller.js";
import { OAuthService } from "./oauth.service.js";

@Module({
  imports: [AuthModule, InvitesModule],
  controllers: [OAuthController],
  providers: [OAuthService],
})
export class OAuthModule {}
