import { Module } from "@nestjs/common";

import { HoldsController } from "./holds.controller.js";
import { HoldsService } from "./holds.service.js";

@Module({ controllers: [HoldsController], providers: [HoldsService], exports: [HoldsService] })
export class HoldsModule {}
