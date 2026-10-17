export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly body?: unknown,
  ) {
    super(`${status} ${code}`);
  }
}
