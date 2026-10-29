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
    .option(
      "--archive <paths...>",
      "archived JSONL files (audit-<from>-<to>.jsonl) to check before the export",
    )
    .action(async (opts: { file: string; archive?: string[] }) => {
      const files = [...(opts.archive ?? []), opts.file];
      const parts: unknown[][] = [];
      for (const file of files) parts.push(await readEntries(resolve(ctx.cwd, file)));
      const archives = parts.slice(0, -1).sort((a, b) => firstSeq(a) - firstSeq(b));
      const entries = [...archives.flat(), ...parts.at(-1)!];
      const first = entries[0] as { seq?: unknown; prevHash?: unknown } | undefined;
      const partial = typeof first?.seq === "number" && first.seq > 1;
      const result = await verifyChain(
        entries,
        partial && typeof first.prevHash === "string" ? { from: first.prevHash } : {},
      );
      if (!result.ok) {
        throw new CliError(
          `Chain broken at seq ${result.firstBrokenSeq} (${result.reason}); ${result.count} entries verified before it`,
        );
      }
      ctx.print(`ok: ${result.count} entries, chain intact`);
      if (partial) {
        ctx.print(
          `note: the files start at seq ${String(first.seq)}; earlier entries are not in them and were not checked. Pass their archives with --archive to check from the start.`,
        );
      }
    });
}

function firstSeq(entries: unknown[]): number {
  const seq = (entries[0] as { seq?: unknown } | undefined)?.seq;
  return typeof seq === "number" ? seq : Number.MAX_SAFE_INTEGER;
}

async function readEntries(path: string): Promise<unknown[]> {
  const text = await readFile(path, "utf8");
  const entries: unknown[] = [];
  for (const [i, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      throw new CliError(`${path}: line ${i + 1} is not valid JSON`);
    }
  }
  return entries;
}
