import { z } from "zod";

import { zodDto } from "../../common/utils/zod-dto.util.js";
import { MAX_WEBHOOK_URL_CHARS } from "../constants/agent.constants.js";

export class SetAgentWebhookDto extends zodDto(
  z.strictObject({
    url: z.url({ protocol: /^https?$/ }).max(MAX_WEBHOOK_URL_CHARS),
  }),
) {}
