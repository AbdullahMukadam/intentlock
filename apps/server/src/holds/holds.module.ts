import { Module } from "@nestjs/common";

import { EventsModule } from "../events/events.module.js";
import { HoldNotifier } from "./hold-notifier.service.js";
import { HoldsController } from "./holds.controller.js";
import { HoldsService } from "./holds.service.js";

@Module({
  imports: [EventsModule],
  controllers: [HoldsController],
  providers: [HoldsService, HoldNotifier],
  exports: [HoldsService],
})
export class HoldsModule {}
