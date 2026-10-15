import {
  hashPassword,
  isWeakPassword,
  verifyPassword,
} from "../../../../src/auth/utils/password.util.js";

describe("password hashing", () => {
  it("hashes with a fresh salt and verifies only the right password", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse battery staple", a)).toBe(true);
    expect(await verifyPassword("correct horse battery stapl", a)).toBe(false);
  });

  it("never verifies against a missing or malformed hash", async () => {
    expect(await verifyPassword("intentlock-no-such-password", null)).toBe(false);
    expect(await verifyPassword("anything at all", "plain")).toBe(false);
    expect(await verifyPassword("anything at all", "scrypt$32768$8$1$c2FsdA$c2hvcnQ")).toBe(false);
  });

  it("calls a password weak when it contains the email or its local part", () => {
    expect(isWeakPassword("alice@acme.dev", "my-ALICE-password")).toBe(true);
    expect(isWeakPassword("alice@acme.dev", "x alice@acme.dev x")).toBe(true);
    expect(isWeakPassword("al@acme.dev", "always a long password")).toBe(false);
    expect(isWeakPassword("alice@acme.dev", "correct horse battery staple")).toBe(false);
  });
});
