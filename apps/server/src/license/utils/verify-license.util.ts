import { compactVerify } from "jose";

import { LicenseStatus } from "../enums/license-status.enum.js";
import { LicenseSchema } from "../schemas/license.schema.js";
import type { LicenseCheck } from "../types/license-check.type.js";

export async function verifyLicense(
  jws: string,
  vendorKey: CryptoKey,
  now: Date,
): Promise<LicenseCheck> {
  let payload: Uint8Array;
  try {
    ({ payload } = await compactVerify(jws.trim(), vendorKey, { algorithms: ["EdDSA"] }));
  } catch {
    return { status: LicenseStatus.INVALID, reason: "bad signature" };
  }
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(payload));
  } catch {
    return { status: LicenseStatus.INVALID, reason: "payload is not JSON" };
  }
  const parsed = LicenseSchema.safeParse(json);
  if (!parsed.success)
    return { status: LicenseStatus.INVALID, reason: "payload does not match the schema" };
  if (parsed.data.exp * 1000 <= now.getTime()) {
    return { status: LicenseStatus.EXPIRED, reason: "license expired" };
  }
  return { status: LicenseStatus.VALID, license: parsed.data };
}
