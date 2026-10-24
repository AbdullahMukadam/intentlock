import type { Checkpoint } from "../guard/checkpoint.js";
import { CheckpointError } from "../guard/checkpoint.js";
import { HttpStatus } from "../guard/enums/http-status.enum.js";
import { checkpointKey, decodeCheckpoint, encodeCheckpoint } from "./codec.js";
import { HttpMethod } from "./enums/http-method.enum.js";
import { sha256Hex, signV4 } from "./sigv4.js";
import type { CheckpointStore } from "./store.js";

export interface S3CheckpointStoreOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  prefix?: string;
  encryptionKey?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => Date;
}

const DEFAULT_PREFIX = "intentlock/checkpoints/";
const DEFAULT_TIMEOUT_MS = 10_000;
const S3_SERVICE = "s3";
const OCTET_STREAM = "application/octet-stream";

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export class S3CheckpointStore implements CheckpointStore {
  readonly #opts: S3CheckpointStoreOptions;
  readonly #key: Buffer | undefined;
  readonly #fetch: typeof fetch;

  constructor(opts: S3CheckpointStoreOptions) {
    this.#opts = opts;
    this.#key = opts.encryptionKey === undefined ? undefined : checkpointKey(opts.encryptionKey);
    this.#fetch = opts.fetch ?? fetch;
  }

  async save(key: string, checkpoint: Checkpoint): Promise<void> {
    const res = await this.#send(HttpMethod.PUT, key, encodeCheckpoint(key, checkpoint, this.#key));
    if (!res.ok) throw await this.#failure(HttpMethod.PUT, key, res);
  }

  async load(key: string): Promise<Checkpoint | null> {
    const res = await this.#send(HttpMethod.GET, key);
    if (res.status === HttpStatus.NOT_FOUND) {
      await res.body?.cancel();
      return null;
    }
    if (!res.ok) throw await this.#failure(HttpMethod.GET, key, res);
    return decodeCheckpoint(key, Buffer.from(await res.arrayBuffer()), this.#key);
  }

  async delete(key: string): Promise<void> {
    const res = await this.#send(HttpMethod.DELETE, key);
    if (!res.ok && res.status !== HttpStatus.NOT_FOUND) {
      throw await this.#failure(HttpMethod.DELETE, key, res);
    }
    await res.body?.cancel();
  }

  #url(key: string): URL {
    const base = new URL(this.#opts.endpoint);
    const objectKey = (this.#opts.prefix ?? DEFAULT_PREFIX) + key;
    const path = [this.#opts.bucket, ...objectKey.split("/")].map(encodeSegment).join("/");
    base.pathname = `${base.pathname.replace(/\/+$/, "")}/${path}`;
    return base;
  }

  async #send(method: HttpMethod, key: string, body?: Buffer): Promise<Response> {
    const url = this.#url(key);
    const headers = signV4({
      method,
      url,
      headers: body ? { "content-type": OCTET_STREAM } : {},
      payloadHash: sha256Hex(body ?? ""),
      region: this.#opts.region,
      service: S3_SERVICE,
      accessKeyId: this.#opts.accessKeyId,
      secretAccessKey: this.#opts.secretAccessKey,
      ...(this.#opts.sessionToken !== undefined && { sessionToken: this.#opts.sessionToken }),
      now: this.#opts.now?.() ?? new Date(),
    });
    try {
      return await this.#fetch(url, {
        method,
        headers,
        body: body ? new Uint8Array(body) : null,
        signal: AbortSignal.timeout(this.#opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      throw new CheckpointError(
        `${method} checkpoint ${key} failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      );
    }
  }

  async #failure(method: HttpMethod, key: string, res: Response): Promise<CheckpointError> {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return new CheckpointError(`${method} checkpoint ${key} answered ${res.status}: ${text}`);
  }
}
