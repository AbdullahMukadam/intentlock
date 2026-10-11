import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";

import { AgentIdParamsDto } from "../agents/dto/agent-id-params.dto.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import type { SessionUser } from "../common/types/auth.types.js";
import { UserRole } from "../users/enums/user-role.enum.js";
import { PolicyVersionParamsDto } from "./dto/policy-version-params.dto.js";
import { PublishPolicyDto } from "./dto/publish-policy.dto.js";
import { RollbackPolicyDto } from "./dto/rollback-policy.dto.js";
import { SaveDraftDto } from "./dto/save-draft.dto.js";
import { TestPolicyDto } from "./dto/test-policy.dto.js";
import { ValidatePolicyDto } from "./dto/validate-policy.dto.js";
import { PoliciesService } from "./policies.service.js";

@Controller("v1/agents/:id/policy")
export class PoliciesController {
  constructor(private readonly policies: PoliciesService) {}

  @Get()
  get(@CurrentUser() user: SessionUser, @Param() { id }: AgentIdParamsDto) {
    return this.policies.get(user.orgId, id);
  }

  @Get("versions")
  versions(@CurrentUser() user: SessionUser, @Param() { id }: AgentIdParamsDto) {
    return this.policies.versions(user.orgId, id);
  }

  @Get("versions/:version")
  version(@CurrentUser() user: SessionUser, @Param() { id, version }: PolicyVersionParamsDto) {
    return this.policies.getVersion(user.orgId, id, version);
  }

  @Roles(UserRole.ADMIN)
  @Put("draft")
  saveDraft(
    @CurrentUser() admin: SessionUser,
    @Param() { id }: AgentIdParamsDto,
    @Body() body: SaveDraftDto,
  ) {
    return this.policies.saveDraft(admin, id, body.source, body.baseVersion);
  }

  @Post("validate")
  @HttpCode(HttpStatus.OK)
  validate(@Param() _params: AgentIdParamsDto, @Body() body: ValidatePolicyDto) {
    return this.policies.validate(body.source);
  }

  @Roles(UserRole.ADMIN, UserRole.APPROVER)
  @Post("test")
  @HttpCode(HttpStatus.OK)
  test(
    @CurrentUser() user: SessionUser,
    @Param() { id }: AgentIdParamsDto,
    @Body() body: TestPolicyDto,
  ) {
    return this.policies.test(user.orgId, id, body.source, body.calls, body.replayLast);
  }

  @Roles(UserRole.ADMIN)
  @Post("publish")
  publish(
    @CurrentUser() admin: SessionUser,
    @Param() { id }: AgentIdParamsDto,
    @Body() body: PublishPolicyDto,
  ) {
    return this.policies.publish(admin, id, body.source, body.baseVersion, body.message);
  }

  @Roles(UserRole.ADMIN)
  @Post("rollback")
  rollback(
    @CurrentUser() admin: SessionUser,
    @Param() { id }: AgentIdParamsDto,
    @Body() body: RollbackPolicyDto,
  ) {
    return this.policies.rollback(admin, id, body.toVersion, body.message);
  }
}
