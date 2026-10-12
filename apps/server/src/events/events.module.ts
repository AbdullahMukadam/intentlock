import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { EventsGateway } from "./events.gateway.js";
import { EventsService } from "./events.service.js";

@Module({
  imports: [AuthModule],
  providers: [EventsGateway, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
