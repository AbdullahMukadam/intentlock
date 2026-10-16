import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { SetupController } from "./setup.controller.js";
import { SetupService } from "./setup.service.js";

@Module({ imports: [AuthModule], controllers: [SetupController], providers: [SetupService] })
export class SetupModule {}
