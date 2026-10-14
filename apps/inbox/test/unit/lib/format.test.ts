import { expect, test } from "vitest";

import { formatDuration } from "../../../src/lib/format";

test.each([
  [null, "—"],
  [0.0123, "12 ms"],
  [4.25, "4.3 s"],
  [125, "2 min"],
  [5400, "1.5 h"],
])("formatDuration(%s) = %s", (seconds, expected) => {
  expect(formatDuration(seconds)).toBe(expected);
});
