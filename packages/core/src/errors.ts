export class IntentlockError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidTokenError extends IntentlockError {}

export class TokenExpiredError extends InvalidTokenError {}
