import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { exportPrivateKeyPem, generateSigningKeyPair } from "@intentlock/core";

import { LicenseEdition } from "../enums/license-edition.enum.js";
import { LicenseFeature } from "../enums/license-feature.enum.js";
import { LicenseStatus } from "../enums/license-status.enum.js";
import { verifyLicense } from "./verify-license.util.js";

const ROOT = resolve(import.meta.dirname, "../../../../..");
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
  it("issues a license the server accepts with exactly the requested limits", async () => {
    const jws = issue(
      "--licensee",
      "Acme",
      "--edition",
      LicenseEdition.TEAM,
      "--expires",
      "2099-01-31",
      "--max-users",
      "25",
      "--features",
      `${LicenseFeature.MULTI_INSTANCE},${LicenseFeature.AUDIT_EXPORT}`,
    );
    const result = await verifyLicense(jws, vendor.publicKey, new Date());
    expect(result).toMatchObject({
      status: LicenseStatus.VALID,
      license: {
        licensee: "Acme",
        edition: LicenseEdition.TEAM,
        maxUsers: 25,
        maxAgents: null,
        retentionDays: 90,
        features: [LicenseFeature.MULTI_INSTANCE, LicenseFeature.AUDIT_EXPORT],
      },
    });
  }, 30_000);

  it("is rejected when signed by another key or past its expiry", async () => {
    const jws = issue(
      "--licensee",
      "Acme",
      "--edition",
      LicenseEdition.TEAM,
      "--expires",
      "2000-01-01",
    );
    expect((await verifyLicense(jws, vendor.publicKey, new Date())).status).toBe(
      LicenseStatus.EXPIRED,
    );
    expect((await verifyLicense(jws, stranger.publicKey, new Date(0))).status).toBe(
      LicenseStatus.INVALID,
    );
  }, 30_000);

  it("refuses to sign an invalid license", () => {
    expect(() =>
      issue("--licensee", "Acme", "--edition", "platinum", "--expires", "2099-01-01"),
    ).toThrow();
  }, 30_000);
});
