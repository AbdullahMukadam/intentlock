import { sha256Hex, signV4 } from "@intentlock/core";

import { HttpMethod } from "../../common/enums/http-method.enum.js";
import { AUDIT_ARCHIVE_TIMEOUT_MS, JSONL_CONTENT_TYPE } from "../constants/audit.constants.js";
import { ArchiveTarget } from "../enums/archive-target.enum.js";
import type { AuditArchive } from "../types/audit-archive.type.js";

export type S3ArchiveOptions = {
  bucketUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetch?: typeof fetch;
};

export class S3Archive implements AuditArchive {
  readonly target = ArchiveTarget.S3;
  readonly location: string;
  readonly #opts: S3ArchiveOptions;

  constructor(opts: S3ArchiveOptions) {
    this.#opts = opts;
    this.location = opts.bucketUrl.replace(/\/+$/, "");
  }

  async put(name: string, data: Uint8Array): Promise<void> {
    const res = await this.#send(HttpMethod.PUT, name, data);
    if (!res.ok) throw new Error(`PUT ${name} answered HTTP ${String(res.status)}`);
  }

  async get(name: string): Promise<Uint8Array> {
    const res = await this.#send(HttpMethod.GET, name);
    if (!res.ok) throw new Error(`GET ${name} answered HTTP ${String(res.status)}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async #send(method: HttpMethod, name: string, body?: Uint8Array): Promise<Response> {
    const url = new URL(`${this.location}/${encodeURIComponent(name)}`);
    const headers = await signV4({
      method,
      url,
      headers: body ? { "content-type": JSONL_CONTENT_TYPE } : {},
      payloadHash: await sha256Hex(body ?? ""),
      region: this.#opts.region,
      service: "s3",
      accessKeyId: this.#opts.accessKeyId,
      secretAccessKey: this.#opts.secretAccessKey,
      now: new Date(),
    });
    return (this.#opts.fetch ?? fetch)(url, {
      method,
      headers,
      body: body ? new Uint8Array(body) : null,
      signal: AbortSignal.timeout(AUDIT_ARCHIVE_TIMEOUT_MS),
    });
  }
}
