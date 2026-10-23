import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { FileCheckpointStore } from "../../../src/checkpoints/file-store.js";
import { S3CheckpointStore } from "../../../src/checkpoints/s3-store.js";
import type { Checkpoint } from "../../../src/guard/checkpoint.js";
import { MessageRole } from "../../../src/provider/enums/message-role.enum.js";

const KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");

const checkpoint: Checkpoint = {
  version: 1,
  planId: "plan-1",
  token: "t1",
  user: "alice@acme-demo.dev",
  turn: 1,
  savedAt: "2026-10-23T10:00:00.000Z",
  messages: [
    { role: MessageRole.USER, text: "Label it" },
    {
      role: MessageRole.ASSISTANT,
      toolCalls: [{ id: "h", name: "add_label", args: { repo: "acme/app" } }],
    },
  ],
  results: [null],
  held: [{ index: 0, holdId: "h1", ruleId: "hold-labels" }],
  gate: null,
};

const dirs: string[] = [];
async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), "il-checkpoints-"));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("FileCheckpointStore", () => {
  test("save, load and delete, plain and encrypted", async () => {
    for (const encryptionKey of [undefined, KEY]) {
      const store = new FileCheckpointStore({
        dir: await tempDir(),
        ...(encryptionKey && { encryptionKey }),
      });
      expect(await store.load("plan-1")).toBeNull();
      await store.save("plan-1", checkpoint);
      expect(await store.load("plan-1")).toEqual(checkpoint);
      await store.delete("plan-1");
      expect(await store.load("plan-1")).toBeNull();
    }
  });

  test("encrypted data hides the conversation and refuses a wrong key, edits and plain files", async () => {
    const dir = await tempDir();
    await new FileCheckpointStore({ dir, encryptionKey: KEY }).save("plan-1", checkpoint);
    const path = join(dir, "plan-1.checkpoint");
    const bytes = await readFile(path);
    expect(bytes.toString("latin1")).not.toContain("Label it");

    await expect(
      new FileCheckpointStore({ dir, encryptionKey: OTHER_KEY }).load("plan-1"),
    ).rejects.toThrow(/could not be decrypted/);
    await expect(new FileCheckpointStore({ dir }).load("plan-1")).rejects.toThrow(/no key/);

    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
    await writeFile(path, bytes);
    await expect(
      new FileCheckpointStore({ dir, encryptionKey: KEY }).load("plan-1"),
    ).rejects.toThrow(/could not be decrypted/);

    await new FileCheckpointStore({ dir }).save("plan-1", checkpoint);
    await expect(
      new FileCheckpointStore({ dir, encryptionKey: KEY }).load("plan-1"),
    ).rejects.toThrow(/not encrypted/);
  });

  test("an encrypted checkpoint copied to another key is refused", async () => {
    const dir = await tempDir();
    const store = new FileCheckpointStore({ dir, encryptionKey: KEY });
    await store.save("plan-1", checkpoint);
    await writeFile(join(dir, "plan-2.checkpoint"), await readFile(join(dir, "plan-1.checkpoint")));
    await expect(store.load("plan-2")).rejects.toThrow(/could not be decrypted/);
  });

  test("a key of the wrong length is refused", () => {
    expect(() => new FileCheckpointStore({ dir: "x", encryptionKey: "c2hvcnQ=" })).toThrow(
      /32 bytes/,
    );
  });
});

describe("S3CheckpointStore", () => {
  function fakeS3() {
    const objects = new Map<string, Uint8Array>();
    const requests: { method: string; url: string; auth: string | null }[] = [];
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      requests.push({
        method: init?.method ?? "GET",
        url: url.href,
        auth: headers.get("authorization"),
      });
      const key = url.pathname;
      if (init?.method === "PUT") {
        objects.set(key, new Uint8Array(init.body as Uint8Array));
        return new Response(null, { status: 200 });
      }
      if (init?.method === "DELETE") {
        objects.delete(key);
        return new Response(null, { status: 204 });
      }
      const body = objects.get(key);
      return body ? new Response(body) : new Response("NoSuchKey", { status: 404 });
    }) as typeof globalThis.fetch;
    return { fetch, requests };
  }

  test("signed path-style requests; save, load, delete, missing is null", async () => {
    const s3 = fakeS3();
    const store = new S3CheckpointStore({
      endpoint: "https://abc.supabase.co/storage/v1/s3",
      region: "eu-central-1",
      bucket: "checkpoints",
      accessKeyId: "AK",
      secretAccessKey: "SK",
      encryptionKey: KEY,
      fetch: s3.fetch,
    });
    expect(await store.load("plan-1")).toBeNull();
    await store.save("plan-1", checkpoint);
    expect(await store.load("plan-1")).toEqual(checkpoint);
    await store.delete("plan-1");
    expect(await store.load("plan-1")).toBeNull();
    expect(s3.requests[1]).toMatchObject({
      method: "PUT",
      url: "https://abc.supabase.co/storage/v1/s3/checkpoints/intentlock/checkpoints/plan-1",
    });
    expect(s3.requests[1]!.auth).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/eu-central-1\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    );
  });

  test("a failing bucket is an error, not an empty checkpoint", async () => {
    const store = new S3CheckpointStore({
      endpoint: "https://s3.example.com",
      region: "us-east-1",
      bucket: "b",
      accessKeyId: "AK",
      secretAccessKey: "SK",
      fetch: (async () => new Response("AccessDenied", { status: 403 })) as typeof fetch,
    });
    await expect(store.load("plan-1")).rejects.toThrow(/answered 403: AccessDenied/);
    await expect(store.save("plan-1", checkpoint)).rejects.toThrow(/answered 403/);
  });
});
