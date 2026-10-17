import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parsePolicy } from "@intentlock/core";
import type { Command } from "commander";

import { CliError } from "../errors.js";
import type { CliContext } from "../types/cli-context.type.js";

export async function readPolicyFile(ctx: CliContext, file: string): Promise<string> {
  try {
    return await readFile(resolve(ctx.cwd, file), "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new CliError(`Cannot read ${file}${code ? `: ${code}` : ""}`, { cause: err });
  }
}

export async function readCalls(ctx: CliContext, file: string): Promise<unknown> {
  const text = await readPolicyFile(ctx, file);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliError(`${file} is not valid JSON`);
  }
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
