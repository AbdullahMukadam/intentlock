import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { Checkpoint } from "../guard/checkpoint.js";
import { FsErrorCode } from "./enums/fs-error-code.enum.js";
import { checkpointKey, decodeCheckpoint, encodeCheckpoint } from "./codec.js";
import type { CheckpointStore } from "./store.js";

export interface FileCheckpointStoreOptions {
  dir: string;
  encryptionKey?: string;
}

const EXT = ".checkpoint";
const PRIVATE_FILE = 0o600;

export class FileCheckpointStore implements CheckpointStore {
  readonly #dir: string;
  readonly #key: Buffer | undefined;

  constructor(opts: FileCheckpointStoreOptions) {
    this.#dir = opts.dir;
    this.#key = opts.encryptionKey === undefined ? undefined : checkpointKey(opts.encryptionKey);
  }

  async save(key: string, checkpoint: Checkpoint): Promise<void> {
    await mkdir(this.#dir, { recursive: true });
    const path = this.#path(key);
    await writeFile(`${path}.tmp`, encodeCheckpoint(key, checkpoint, this.#key), {
      mode: PRIVATE_FILE,
    });
    await rename(`${path}.tmp`, path);
  }

  async load(key: string): Promise<Checkpoint | null> {
    let data: Buffer;
    try {
      data = await readFile(this.#path(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === FsErrorCode.NOT_FOUND) return null;
      throw err;
    }
    return decodeCheckpoint(key, data, this.#key);
  }

  async delete(key: string): Promise<void> {
    await rm(this.#path(key), { force: true });
  }

  #path(key: string): string {
    return join(this.#dir, key.replace(/[^A-Za-z0-9_-]/g, "_") + EXT);
  }
}
