import { IntentlockError } from "@intentlock/core";

import { describeServerAnswer } from "./http/describe-failure.js";

export class GateUnavailableError extends IntentlockError {}

export class HttpError extends IntentlockError {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`Intentlock server ${describeServerAnswer(status, body)}`);
  }
}
