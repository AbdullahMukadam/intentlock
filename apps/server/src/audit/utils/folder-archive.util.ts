import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { ArchiveTarget } from "../enums/archive-target.enum.js";
import type { AuditArchive } from "../types/audit-archive.type.js";

export class FolderArchive implements AuditArchive {
  readonly target = ArchiveTarget.FOLDER;
  readonly location: string;

  constructor(dir: string) {
    this.location = resolve(dir);
  }

  async put(name: string, data: Uint8Array): Promise<void> {
    await mkdir(this.location, { recursive: true });
    await writeFile(join(this.location, name), data, { flush: true });
  }

  async get(name: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.location, name)));
  }
}
