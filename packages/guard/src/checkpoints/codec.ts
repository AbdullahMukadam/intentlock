import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { type Checkpoint, CheckpointError } from "../guard/checkpoint.js";
import { parseCheckpoint } from "../guard/resume.js";

const MAGIC = Buffer.from("ilcp1:");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const CIPHER = "aes-256-gcm";

export function checkpointKey(base64: string): Buffer {
  const key = Buffer.from(base64, "base64");
  if (key.length !== KEY_BYTES) {
    throw new CheckpointError(`Checkpoint encryption key must be ${KEY_BYTES} bytes, base64`);
  }
  return key;
}

export function encodeCheckpoint(storeKey: string, checkpoint: Checkpoint, key?: Buffer): Buffer {
  const json = Buffer.from(JSON.stringify(checkpoint));
  if (!key) return json;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(Buffer.from(storeKey));
  const body = Buffer.concat([cipher.update(json), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decodeCheckpoint(storeKey: string, data: Buffer, key?: Buffer): Checkpoint {
  const encrypted = data.subarray(0, MAGIC.length).equals(MAGIC);
  if (encrypted !== Boolean(key)) {
    throw new CheckpointError(
      key ? "Checkpoint is not encrypted; refusing it" : "Checkpoint is encrypted; no key given",
    );
  }
  let json: Buffer = data;
  if (key) {
    const iv = data.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
    const tag = data.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
    try {
      const decipher = createDecipheriv(CIPHER, key, iv);
      decipher.setAAD(Buffer.from(storeKey));
      decipher.setAuthTag(tag);
      json = Buffer.concat([
        decipher.update(data.subarray(MAGIC.length + IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]);
    } catch {
      throw new CheckpointError("Checkpoint could not be decrypted; wrong key or edited data");
    }
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json.toString("utf8"));
  } catch {
    throw new CheckpointError("Checkpoint is not valid JSON");
  }
  return parseCheckpoint(raw);
}
