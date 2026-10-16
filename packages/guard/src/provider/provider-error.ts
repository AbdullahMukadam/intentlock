import { IntentlockError } from "@intentlock/core";

import { HttpStatus } from "../guard/enums/http-status.enum.js";
import type { Message } from "./types.js";

const RETRYABLE_STATUSES = new Set<number>([
  HttpStatus.REQUEST_TIMEOUT,
  HttpStatus.CONFLICT,
  HttpStatus.TOO_MANY_REQUESTS,
]);

export interface ProviderErrorDetails {
  provider: string;
  status: number | null;
  retryable: boolean;
  planId?: string;
  messages?: Message[];
  cause?: unknown;
}

export class ProviderError extends IntentlockError {
  readonly provider: string;
  readonly status: number | null;
  readonly retryable: boolean;
  readonly planId: string | undefined;
  readonly messages: Message[] | undefined;

  constructor(message: string, details: ProviderErrorDetails) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.provider = details.provider;
    this.status = details.status;
    this.retryable = details.retryable;
    this.planId = details.planId;
    this.messages = details.messages;
  }

  withRun(planId: string, messages: Message[]): ProviderError {
    return new ProviderError(this.message, {
      provider: this.provider,
      status: this.status,
      retryable: this.retryable,
      planId,
      messages,
      cause: this.cause,
    });
  }
}

export function toProviderError(provider: string, err: unknown): ProviderError {
  if (err instanceof ProviderError) return err;
  const status =
    typeof (err as { status?: unknown } | null)?.status === "number"
      ? (err as { status: number }).status
      : null;
  const reason = err instanceof Error ? err.message : String(err);
  const prefix = status === null || reason.startsWith(String(status)) ? "" : `${status} `;
  return new ProviderError(`${provider} failed: ${prefix}${reason}`, {
    provider,
    status,
    retryable:
      status === null ||
      RETRYABLE_STATUSES.has(status) ||
      status >= HttpStatus.INTERNAL_SERVER_ERROR,
    cause: err,
  });
}
