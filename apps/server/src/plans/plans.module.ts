import { Module } from "@nestjs/common";

import { PlansController } from "./plans.controller.js";
import { PlansService } from "./plans.service.js";

@Module({ controllers: [PlansController], providers: [PlansService] })
export class PlansModule {}
