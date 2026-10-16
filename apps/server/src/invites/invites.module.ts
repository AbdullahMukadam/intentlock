import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { InviteAcceptController } from "./invite-accept.controller.js";
import { InvitesController } from "./invites.controller.js";
import { InvitesService } from "./invites.service.js";

@Module({
  imports: [AuthModule],
  controllers: [InvitesController, InviteAcceptController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
