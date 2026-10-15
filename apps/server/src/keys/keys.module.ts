import { Global, Module } from "@nestjs/common";

import { KeysController } from "./keys.controller.js";
import { KeysService } from "./keys.service.js";

@Global()
@Module({ controllers: [KeysController], providers: [KeysService], exports: [KeysService] })
export class KeysModule {}
