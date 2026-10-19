import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { ClientEntry, IntentlockError } from "@intentlock/core";

import { FsErrorCode } from "../enums/fs-error-code.enum.js";
import { MemoryOutbox, type PlanBacklog } from "./memory-outbox.js";

const ENTRIES = ".jsonl";
const ACK = ".ack";
const DONE = ".done";

export class FileOutbox extends MemoryOutbox {
  readonly #dir: string;
  readonly #fsync: boolean;
  readonly #onError: (err: unknown) => void;

  constructor(dir: string, opts: { fsync?: boolean; onError?: (err: unknown) => void } = {}) {
    super();
    this.#dir = dir;
    this.#fsync = opts.fsync ?? true;
    this.#onError = opts.onError ?? (() => undefined);
  }

  override async recover(): Promise<PlanBacklog[]> {
    await mkdir(this.#dir, { recursive: true });
    const recovered: PlanBacklog[] = [];
    for (const file of await readdir(this.#dir)) {
      if (!file.endsWith(ENTRIES)) continue;
      const planId = file.slice(0, -ENTRIES.length);
      const entries = this.#parseLines(file, await readFile(this.#path(planId, ENTRIES), "utf8"));
      const acked = Number((await this.#readOptional(this.#path(planId, ACK))) ?? 0) || 0;
      const done = (await this.#readOptional(this.#path(planId, DONE))) !== null;
      const state = this.state(planId);
      state.last = entries.at(-1) ?? null;
      state.pending = entries.filter((e) => e.clientSeq > acked);
      state.done = done;
      recovered.push({ planId, entries });
      if (done && state.pending.length === 0) await this.remove(planId);
    }
    return recovered;
  }

  protected override async persistEntry(planId: string, entry: ClientEntry): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const handle = await open(this.#path(planId, ENTRIES), "a");
    try {
      await handle.appendFile(`${JSON.stringify(entry)}\n`);
      if (this.#fsync) await handle.sync();
    } finally {
      await handle.close();
    }
  }

  protected override async persistAck(planId: string, clientSeq: number): Promise<void> {
    const tmp = this.#path(planId, `${ACK}.tmp`);
    await writeFile(tmp, String(clientSeq));
    await rename(tmp, this.#path(planId, ACK));
  }

  protected override async persistDone(planId: string): Promise<void> {
    await writeFile(this.#path(planId, DONE), "");
  }

  protected override async remove(planId: string): Promise<void> {
    await Promise.all(
      [ENTRIES, ACK, DONE].map((ext) => rm(this.#path(planId, ext), { force: true })),
    );
  }

  #path(planId: string, ext: string): string {
    return join(this.#dir, planId.replace(/[^A-Za-z0-9_-]/g, "_") + ext);
  }

  #parseLines(file: string, text: string): ClientEntry[] {
    const out: ClientEntry[] = [];
    for (const [i, line] of text.split("\n").entries()) {
      if (!line.trim()) continue;
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch {
        json = undefined;
      }
      const parsed = ClientEntry.safeParse(json);
      if (parsed.success) out.push(parsed.data);
      else {
        this.#onError(
          new IntentlockError(`Outbox ${file} line ${i + 1} is not a valid entry; skipped`),
        );
      }
    }
    return out;
  }

  async #readOptional(path: string): Promise<string | null> {
    try {
      return await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== FsErrorCode.NOT_FOUND) {
        this.#onError(
          new IntentlockError(`Outbox could not read ${path}; treated as missing`, { cause: err }),
        );
      }
      return null;
    }
  }
}
