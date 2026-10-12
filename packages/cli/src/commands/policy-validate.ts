import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parsePolicy } from "@intentlock/core";
import type { Command } from "commander";

import { CliError } from "../errors.js";
import type { CliContext } from "../types/cli-context.type.js";

export async function readPolicyFile(ctx: CliContext, file: string): Promise<string> {
  return readFile(resolve(ctx.cwd, file), "utf8");
}

export function validatePolicySource(ctx: CliContext, file: string, source: string) {
  const parsed = parsePolicy(source);
  if (parsed.ok) return parsed.policy;
  for (const e of parsed.errors) {
    ctx.print(`${file}:${e.line}:${e.col} ${e.path ? `${e.path}: ` : ""}${e.message}`);
  }
  throw new CliError(`${parsed.errors.length} error(s) in ${file}`);
}

export function registerPolicyValidate(policy: Command, ctx: CliContext) {
  policy
    .command("validate")
    .description("Check a policy YAML file offline")
    .argument("<file>")
    .action(async (file: string) => {
      const p = validatePolicySource(ctx, file, await readPolicyFile(ctx, file));
      ctx.print(`ok: ${p.rules.length} rules`);
    });
}
