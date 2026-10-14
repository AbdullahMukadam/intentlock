import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parsePolicy, type PolicySet } from "@intentlock/core";

import type { Domain } from "./enums/domain.enum.js";

export const POLICY_DIR = join(import.meta.dirname, "..", "policies");

export async function loadPolicy(domain: Domain): Promise<PolicySet> {
  const parsed = parsePolicy(await readFile(join(POLICY_DIR, `${domain}.yaml`), "utf8"));
  if (!parsed.ok) throw new Error(`${domain}.yaml: ${JSON.stringify(parsed.errors)}`);
  return parsed.policy;
}
