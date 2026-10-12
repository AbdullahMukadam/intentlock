import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { verifyChain } from "@intentlock/core";
import type { Command } from "commander";

import { CliError } from "../errors.js";
import type { CliContext } from "../types/cli-context.type.js";

export function registerAuditVerify(program: Command, ctx: CliContext) {
  program
    .command("audit")
    .description("Audit log tools")
    .command("verify")
    .description("Verify an exported audit chain (GET /v1/audit?format=jsonl) offline")
    .requiredOption("--file <path>", "JSONL export")
    .action(async (opts: { file: string }) => {
      const text = await readFile(resolve(ctx.cwd, opts.file), "utf8");
      const entries: unknown[] = [];
      for (const [i, line] of text.split("\n").entries()) {
        if (!line.trim()) continue;
        try {
          entries.push(JSON.parse(line));
        } catch {
          throw new CliError(`Line ${i + 1} is not valid JSON`);
        }
      }
      const result = await verifyChain(entries);
      if (!result.ok) {
        throw new CliError(
          `Chain broken at seq ${result.firstBrokenSeq} (${result.reason}); ${result.count} entries verified before it`,
        );
      }
      ctx.print(`ok: ${result.count} entries, chain intact`);
    });
}
