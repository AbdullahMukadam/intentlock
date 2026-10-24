import { WEBHOOK_RETRY_SECONDS } from "../constants/hold.constants.js";

export function webhookRetryDelaySeconds(attempts: number): number | null {
  return WEBHOOK_RETRY_SECONDS[attempts - 1] ?? null;
}
