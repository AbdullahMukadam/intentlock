import type { ArchiveTarget } from "../enums/archive-target.enum.js";

export interface AuditArchive {
  readonly target: ArchiveTarget;
  readonly location: string;
  put(name: string, data: Uint8Array): Promise<void>;
  get(name: string): Promise<Uint8Array>;
}
