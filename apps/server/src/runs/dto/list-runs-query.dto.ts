import { z } from "zod";

import { Email } from "../../common/schemas/email.schema.js";
import { zodDto } from "../../common/utils/zod-dto.util.js";
import { RUNS_PAGE_DEFAULT, RUNS_PAGE_MAX } from "../constants/runs.constants.js";
import { RunStatus } from "../enums/run-status.enum.js";

export class ListRunsQueryDto extends zodDto(
  z.strictObject({
    agentId: z.string().min(1).max(64).optional(),
    user: Email.optional(),
    status: z.enum(RunStatus).optional(),
    cursor: z.string().min(1).max(64).optional(),
    limit: z.coerce.number().int().min(1).max(RUNS_PAGE_MAX).default(RUNS_PAGE_DEFAULT),
  }),
) {}
