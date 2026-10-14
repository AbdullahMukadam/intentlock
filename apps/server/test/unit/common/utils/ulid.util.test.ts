import { ulid } from "../../../../src/common/utils/ulid.util.js";

it("is 26 Crockford base32 chars and sorts by time", () => {
  const a = ulid(1_000);
  const b = ulid(2_000);
  expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  expect(a < b).toBe(true);
  expect(ulid()).not.toBe(ulid());
});
