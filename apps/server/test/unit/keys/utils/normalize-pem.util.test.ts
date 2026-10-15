import { normalizePem } from "../../../../src/keys/utils/normalize-pem.util.js";

const PEM = "-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----";

describe("normalizePem", () => {
  it("expands escaped newlines from one-line env values", () => {
    expect(normalizePem("-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n")).toBe(
      PEM,
    );
  });

  it("drops carriage returns from Windows line endings", () => {
    expect(normalizePem(`${PEM.replace(/\n/g, "\r\n")}\r\n`)).toBe(PEM);
  });
});
