import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { API_ENDPOINTS } from "@intentlock/core";

import { CurrentUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import type { SessionUser } from "../../common/types/auth.types.js";
import { UserRole } from "../../users/enums/user-role.enum.js";
import { AgentIdParamsDto } from "../dto/agent-id-params.dto.js";
import { ApiKeysService } from "./api-keys.service.js";
import { ApiKeyParamsDto } from "./dto/api-key-params.dto.js";
import { CreateApiKeyDto } from "./dto/create-api-key.dto.js";

@Roles(UserRole.ADMIN)
@Controller()
export class ApiKeysController {
  constructor(private readonly keys: ApiKeysService) {}

  @Post(API_ENDPOINTS.AGENT_API_KEYS)
  create(
    @CurrentUser() admin: SessionUser,
    @Param() { id }: AgentIdParamsDto,
    @Body() body: CreateApiKeyDto,
  ) {
    return this.keys.create(admin, id, body.name);
  }

  @Get(API_ENDPOINTS.AGENT_API_KEYS)
  list(@CurrentUser() admin: SessionUser, @Param() { id }: AgentIdParamsDto) {
    return this.keys.list(admin.orgId, id);
  }

  @Delete(API_ENDPOINTS.AGENT_API_KEY)
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(@CurrentUser() admin: SessionUser, @Param() { id, keyId }: ApiKeyParamsDto) {
    return this.keys.revoke(admin, id, keyId);
  }
}
