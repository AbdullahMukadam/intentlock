import { ToolCall } from "@intentlock/core";
import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { UserGroupsSchema, UserRoleSchema } from "../../users/schemas/user-fields.schema.js";
import { MAX_POLICY_SOURCE_LENGTH } from "../constants/policy.constants.js";

export const PolicySourceSchema = z.string().min(1).max(MAX_POLICY_SOURCE_LENGTH);
export const PolicyVersionNumberSchema = z.coerce.number().int().positive();
export const PolicyMessageSchema = z.string().trim().min(1).max(500);

export const SampleCallSchema = z.strictObject({
  call: ToolCall,
  user: z.strictObject({
    email: Email,
    role: UserRoleSchema,
    groups: UserGroupsSchema.default([]),
  }),
  inPlan: z.boolean().optional(),
});
