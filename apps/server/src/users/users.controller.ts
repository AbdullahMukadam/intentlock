import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { z } from "zod";

import { CurrentUser, Roles, type SessionUser } from "../common/auth.decorators.js";
import { Email } from "../common/schemas.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { UsersService } from "./users.service.js";

const Role = z.enum(["admin", "approver", "member"]);
const Groups = z.array(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)).max(50);

const CreateUser = z.object({ email: Email, role: Role, groups: Groups.default([]) });
type CreateUser = z.infer<typeof CreateUser>;
const UpdateUser = z
  .object({ role: Role.optional(), groups: Groups.optional(), disabled: z.boolean().optional() })
  .strict();
type UpdateUser = z.infer<typeof UpdateUser>;

const emailParam = new ZodValidationPipe(Email);

@Roles("admin")
@Controller("v1/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(
    @CurrentUser() admin: SessionUser,
    @Body(new ZodValidationPipe(CreateUser)) body: CreateUser,
  ) {
    return this.users.create(admin, body);
  }

  @Get()
  list(@CurrentUser() admin: SessionUser) {
    return this.users.list(admin.orgId);
  }

  @Patch(":email")
  update(
    @CurrentUser() admin: SessionUser,
    @Param("email", emailParam) email: string,
    @Body(new ZodValidationPipe(UpdateUser)) body: UpdateUser,
  ) {
    return this.users.update(admin, email, body);
  }

  @Post(":email/token")
  reissueToken(@CurrentUser() admin: SessionUser, @Param("email", emailParam) email: string) {
    return this.users.reissueToken(admin, email);
  }
}
