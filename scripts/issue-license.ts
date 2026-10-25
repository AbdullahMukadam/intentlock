import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { LicenseEdition } from "../apps/server/src/license/enums/license-edition.enum.js";
import { LicenseSchema } from "../apps/server/src/license/schemas/license.schema.js";

const USAGE = `Usage: pnpm issue-license --key <vendor-private.pem> --licensee <name> --seats <n>
  --expires <YYYY-MM-DD> [--retention-days <n>] [--out <file>]`;

const { values } = parseArgs({
  options: {
    key: { type: "string" },
    licensee: { type: "string" },
    seats: { type: "string" },
    expires: { type: "string" },
    "retention-days": { type: "string", default: "365" },
    out: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

if (!values.key || !values.licensee || !values.seats || !values.expires) {
  fail("Missing a required option.");
}

const expiresAt = Date.parse(`${values.expires}T23:59:59Z`);
if (Number.isNaN(expiresAt))
  fail(`--expires must be a date like 2027-10-12, got "${values.expires}"`);
if (expiresAt <= Date.now()) fail(`--expires must be in the future, got "${values.expires}"`);

const parsed = LicenseSchema.safeParse({
  licensee: values.licensee,
  edition: LicenseEdition.LICENSED,
  maxUsers: Number(values.seats),
  maxAgents: null,
  retentionDays: Number(values["retention-days"]),
  exp: Math.floor(expiresAt / 1000),
});
if (!parsed.success) {
  fail(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
}

const encode = (data: string | Buffer) => Buffer.from(data).toString("base64url");
const signingInput = `${encode(JSON.stringify({ alg: "EdDSA" }))}.${encode(JSON.stringify(parsed.data))}`;
const signature = sign(
  null,
  Buffer.from(signingInput),
  createPrivateKey(readFileSync(values.key, "utf8")),
);
const jws = `${signingInput}.${encode(signature)}`;

if (values.out) {
  writeFileSync(values.out, `${jws}\n`, "utf8");
  console.log(
    `Wrote a ${String(parsed.data.maxUsers)}-seat license for ${parsed.data.licensee} to ${values.out}`,
  );
} else {
  console.log(jws);
}
