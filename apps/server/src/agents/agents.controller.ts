import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { AgentsService } from "./agents.service.js";
import { AgentIdParamsDto } from "./dto/agent-id-params.dto.js";
import { CreateAgentDto } from "./dto/create-agent.dto.js";
import { UpdateAgentDto } from "./dto/update-agent.dto.js";

@Controller("v1/agents")
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Roles(UserRole.ADMIN)
  @Post()
  create(@CurrentUser() admin: SessionUser, @Body() body: CreateAgentDto) {
    return this.agents.create(admin, body);
  }

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.agents.list(user.orgId);
  }

  @Get(":id")
  get(@CurrentUser() user: SessionUser, @Param() { id }: AgentIdParamsDto) {
    return this.agents.get(user.orgId, id);
  }

  @Roles(UserRole.ADMIN)
  @Patch(":id")
  update(
    @CurrentUser() admin: SessionUser,
    @Param() { id }: AgentIdParamsDto,
    @Body() body: UpdateAgentDto,
  ) {
    return this.agents.update(admin, id, body);
  }

  // Agents are never hard-deleted: their policy versions and audit entries must stay resolvable.
  @Roles(UserRole.ADMIN)
  @Delete(":id")
  disable(@CurrentUser() admin: SessionUser, @Param() { id }: AgentIdParamsDto) {
    return this.agents.update(admin, id, { disabled: true });
  }
}
