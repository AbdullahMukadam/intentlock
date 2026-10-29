import { compactVerify } from "jose";

import { LICENSE_GRACE_MS } from "../constants/license.constants.js";
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
  const expiresAt = parsed.data.exp * 1000;
  if (expiresAt <= now.getTime()) {
    if (now.getTime() < expiresAt + LICENSE_GRACE_MS)
      return { status: LicenseStatus.GRACE, license: parsed.data };
    return { status: LicenseStatus.EXPIRED, license: parsed.data, reason: "license expired" };
  }
  return { status: LicenseStatus.VALID, license: parsed.data };
}
