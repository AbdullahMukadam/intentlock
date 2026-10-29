import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { exportPrivateKeyPem, generateSigningKeyPair } from "@intentlock/core";

import { LicenseEdition } from "../../../../src/license/enums/license-edition.enum.js";
import { LicenseStatus } from "../../../../src/license/enums/license-status.enum.js";
import { verifyLicense } from "../../../../src/license/utils/verify-license.util.js";

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const vendor = await generateSigningKeyPair();
const stranger = await generateSigningKeyPair();
const dir = mkdtempSync(join(tmpdir(), "intentlock-issue-"));
const keyFile = join(dir, "vendor.pem");
writeFileSync(keyFile, await exportPrivateKeyPem(vendor.privateKey));

function issue(...args: string[]): string {
  return execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules/tsx/dist/cli.mjs"),
      join(ROOT, "scripts/issue-license.ts"),
      "--key",
      keyFile,
      ...args,
    ],
    { encoding: "utf8" },
  ).trim();
}

describe("scripts/issue-license.ts → verifyLicense", () => {
  it("issues a seat license the server accepts with exactly the requested limits", async () => {
    const jws = issue("--licensee", "Acme", "--seats", "25", "--expires", "2099-01-31");
    const result = await verifyLicense(jws, vendor.publicKey, new Date());
    expect(result).toMatchObject({
      status: LicenseStatus.VALID,
      license: {
        licensee: "Acme",
        edition: LicenseEdition.LICENSED,
        maxUsers: 25,
        maxAgents: null,
        retentionDays: 365,
      },
    });
  }, 30_000);

  it("is rejected when signed by another key or past its expiry", async () => {
    const jws = issue("--licensee", "Acme", "--seats", "5", "--expires", "2099-01-31");
    expect((await verifyLicense(jws, vendor.publicKey, new Date("2100-01-01"))).status).toBe(
      LicenseStatus.EXPIRED,
    );
    expect((await verifyLicense(jws, stranger.publicKey, new Date())).status).toBe(
      LicenseStatus.INVALID,
    );
  }, 30_000);

  it("keeps a license for 14 days after it expires", async () => {
    const jws = issue("--licensee", "Acme", "--seats", "5", "--expires", "2099-01-31");
    const expiry = Date.parse("2099-01-31T23:59:59Z");
    const day = 86_400_000;
    expect((await verifyLicense(jws, vendor.publicKey, new Date(expiry + day))).status).toBe(
      LicenseStatus.GRACE,
    );
    expect((await verifyLicense(jws, vendor.publicKey, new Date(expiry + 14 * day))).status).toBe(
      LicenseStatus.EXPIRED,
    );
  }, 30_000);

  it("refuses to sign without seats, with bad seats or with a past expiry", () => {
    expect(() => issue("--licensee", "Acme", "--expires", "2099-01-01")).toThrow();
    expect(() => issue("--licensee", "Acme", "--seats", "0", "--expires", "2099-01-01")).toThrow();
    expect(() => issue("--licensee", "Acme", "--seats", "5", "--expires", "2000-01-01")).toThrow();
  }, 30_000);
});
