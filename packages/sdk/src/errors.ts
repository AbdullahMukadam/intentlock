import { IntentlockError } from "@intentlock/core";

export class GateUnavailableError extends IntentlockError {}

export class HttpError extends IntentlockError {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Intentlock server answered ${status}`);
  }
}
