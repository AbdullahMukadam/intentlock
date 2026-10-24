import type { Checkpoint } from "../guard/checkpoint.js";

export interface CheckpointStore {
  save(key: string, checkpoint: Checkpoint): Promise<void>;
  load(key: string): Promise<Checkpoint | null>;
  delete(key: string): Promise<void>;
}
