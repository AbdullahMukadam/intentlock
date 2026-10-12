import { Module } from "@nestjs/common";

import { EventsModule } from "../events/events.module.js";
import { HoldsModule } from "../holds/holds.module.js";
import { CheckController } from "./check.controller.js";
import { CheckService } from "./check.service.js";

@Module({
  imports: [HoldsModule, EventsModule],
  controllers: [CheckController],
  providers: [CheckService],
})
export class CheckModule {}
