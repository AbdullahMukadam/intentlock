import { AuditEntry } from "../schemas/audit.js";
import { GENESIS, hashEntry } from "./hash-entry.js";

export type ChainBreak = "invalid_entry" | "prev_hash_mismatch" | "hash_mismatch";

export type ChainResult =
  | { ok: true; count: number }
  | { ok: false; count: number; firstBrokenSeq: number; reason: ChainBreak };

/**
 * Walks entries in the given order (ascending seq). Detects edits, deletions in the middle and
 * reordering; deleting the newest entries is not detectable from the chain alone.
 */
export async function verifyChain(entries: Iterable<unknown>): Promise<ChainResult> {
  let prev = GENESIS;
  let count = 0;
  for (const raw of entries) {
    const parsed = AuditEntry.safeParse(raw);
    if (!parsed.success) {
      const seq = (raw as { seq?: unknown } | null)?.seq;
      return {
        ok: false,
        count,
        firstBrokenSeq: typeof seq === "number" ? seq : count + 1,
        reason: "invalid_entry",
      };
    }
    const { hash, ...body } = parsed.data;
    if (body.prevHash !== prev)
      return { ok: false, count, firstBrokenSeq: body.seq, reason: "prev_hash_mismatch" };
    if ((await hashEntry(body)) !== hash)
      return { ok: false, count, firstBrokenSeq: body.seq, reason: "hash_mismatch" };
    prev = hash;
    count++;
  }
  return { ok: true, count };
}
