import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { MAX_REPLAY, MAX_SAMPLE_CALLS } from "../constants/policy.constants.js";
import { PolicySourceSchema, SampleCallSchema } from "../schemas/policy-fields.schema.js";

export class TestPolicyDto extends zodDto(
  z.strictObject({
    source: PolicySourceSchema,
    calls: z.array(SampleCallSchema).max(MAX_SAMPLE_CALLS).default([]),
    replayLast: z.number().int().min(1).max(MAX_REPLAY).optional(),
  }),
) {}
