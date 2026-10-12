import { Module } from "@nestjs/common";

import { AgentsModule } from "../agents/agents.module.js";
import { PoliciesController } from "./policies.controller.js";
import { PoliciesService } from "./policies.service.js";

@Module({
  imports: [AgentsModule],
  controllers: [PoliciesController],
  providers: [PoliciesService],
  exports: [PoliciesService],
})
export class PoliciesModule {}
