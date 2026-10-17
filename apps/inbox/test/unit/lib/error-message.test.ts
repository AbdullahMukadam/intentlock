import { describe, expect, test } from "vitest";

import { ApiError } from "../../../src/lib/api";
import { errorMessage } from "../../../src/lib/error-message";

const FALLBACK = "Could not create the key.";

describe("errorMessage", () => {
  test("a fetch that never got an answer says the server is unreachable", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), FALLBACK)).toBe(
      "Could not create the key. Can't reach the server.",
    );
  });

  test("form overrides win over shared messages, shared messages over the fallback", () => {
    const weak = new ApiError(400, "password_too_weak");
    expect(errorMessage(weak, FALLBACK)).toBe(
      "Choose a password that does not contain your email.",
    );
    expect(errorMessage(weak, FALLBACK, { password_too_weak: "Pick another one." })).toBe(
      "Pick another one.",
    );
  });

  test("rate limits, database outages and server errors", () => {
    expect(errorMessage(new ApiError(429, "Too Many Requests"), FALLBACK)).toBe(
      "Too many attempts. Wait a minute.",
    );
    expect(errorMessage(new ApiError(503, "database_unavailable"), FALLBACK)).toMatch(
      /cannot reach its database/,
    );
    expect(
      errorMessage(
        new ApiError(500, "internal_error", { error: "internal_error", requestId: "r-1" }),
        FALLBACK,
      ),
    ).toBe("Could not create the key. The server had a problem (request r-1).");
  });

  test("an unknown 4xx code is shown next to the fallback", () => {
    expect(errorMessage(new ApiError(403, "forbidden"), FALLBACK)).toBe(
      "Could not create the key. (forbidden)",
    );
  });
});
