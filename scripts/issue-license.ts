import { createPrivateKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { LicenseEdition } from "../apps/server/src/license/enums/license-edition.enum.js";
import { LicenseFeature } from "../apps/server/src/license/enums/license-feature.enum.js";
import { LicenseSchema } from "../apps/server/src/license/schemas/license.schema.js";

const USAGE = `Usage: pnpm issue-license --key <vendor-private.pem> --licensee <name> --edition <${Object.values(LicenseEdition).join("|")}>
  --expires <YYYY-MM-DD> [--max-users <n|unlimited>] [--max-agents <n|unlimited>]
  [--retention-days <n>] [--features <${Object.values(LicenseFeature).join(",")}>] [--out <file>]`;

const { values } = parseArgs({
  options: {
    key: { type: "string" },
    licensee: { type: "string" },
    edition: { type: "string" },
    expires: { type: "string" },
    "max-users": { type: "string", default: "unlimited" },
    "max-agents": { type: "string", default: "unlimited" },
    "retention-days": { type: "string", default: "90" },
    features: { type: "string", default: "" },
    out: { type: "string" },
  },
});

function fail(message: string): never {
  console.error(`${message}\n\n${USAGE}`);
  process.exit(1);
}

function limit(value: string): number | null {
  return value === "unlimited" ? null : Number(value);
}

if (!values.key || !values.licensee || !values.edition || !values.expires) {
  fail("Missing a required option.");
}

const expiresAt = Date.parse(`${values.expires}T23:59:59Z`);
if (Number.isNaN(expiresAt))
  fail(`--expires must be a date like 2027-10-12, got "${values.expires}"`);

const parsed = LicenseSchema.safeParse({
  licensee: values.licensee,
  edition: values.edition,
  maxUsers: limit(values["max-users"]),
  maxAgents: limit(values["max-agents"]),
  retentionDays: Number(values["retention-days"]),
  features: values.features
    .split(",")
    .map((f) => f.trim())
    .filter(Boolean),
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
  console.log(`Wrote ${parsed.data.edition} license for ${parsed.data.licensee} to ${values.out}`);
} else {
  console.log(jws);
}
