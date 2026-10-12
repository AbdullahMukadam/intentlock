import { Module } from "@nestjs/common";

import { AgentsModule } from "../agents.module.js";
import { ApiKeysController } from "./api-keys.controller.js";
import { ApiKeysService } from "./api-keys.service.js";

@Module({ imports: [AgentsModule], controllers: [ApiKeysController], providers: [ApiKeysService] })
export class ApiKeysModule {}
