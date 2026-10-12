import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";
import { AUDIT_PAGE_DEFAULT, AUDIT_PAGE_MAX } from "../constants/audit.constants.js";
import { AuditFormat } from "../enums/audit-format.enum.js";
import { AuditVerdict } from "../enums/audit-verdict.enum.js";

const Id = z.string().min(1).max(100);

export class AuditQueryDto extends zodDto(
  z.strictObject({
    agentId: Id.optional(),
    user: Email.optional(),
    tool: Id.optional(),
    verdict: z.enum(AuditVerdict).optional(),
    ruleId: Id.optional(),
    policyVersion: z.coerce.number().int().positive().optional(),
    q: z.string().trim().min(1).max(200).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(AUDIT_PAGE_MAX).default(AUDIT_PAGE_DEFAULT),
    format: z.enum(AuditFormat).default(AuditFormat.JSON),
  }),
) {}
