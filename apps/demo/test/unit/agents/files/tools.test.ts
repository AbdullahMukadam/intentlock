import { mkdtemp, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { toolset } from "@intentlock/guard";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { FilesTool } from "../../../../src/agents/files/enums/files-tool.enum.js";
import { FAKE_SECRET, seedSandbox } from "../../../../src/agents/files/sandbox.js";
import { filesTools, inSandbox } from "../../../../src/agents/files/tools.js";
import { createReceiver } from "../../../../src/webhook-receiver.js";

let root: string;
const receiver = createReceiver();
let url: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "intentlock-files-"));
  await seedSandbox(root);
  await new Promise<void>((r) => receiver.server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(receiver.server.address() as AddressInfo).port}/collect`;
});

afterAll(() => new Promise((r) => receiver.server.close(r)));

const run = (name: FilesTool, args: Record<string, unknown>, written: string[] = []) => {
  const impl = toolset(filesTools(root, written)).impls[name];
  if (!impl) throw new Error(`no impl ${name}`);
  return impl(args);
};

describe("inSandbox", () => {
  test.each(["../x", "workspace/../../x", "/etc/passwd", ".."])("refuses %s", (path) => {
    expect(() => inSandbox(root, path)).toThrow("outside the sandbox");
  });

  test.each(["workspace/a.md", ".env", "workspace/../.env", "."])("keeps %s inside", (path) => {
    expect(inSandbox(root, path).startsWith(root)).toBe(true);
  });
});

describe("files tools", () => {
  test("fs_list lists the seeded workspace", async () => {
    expect(await run(FilesTool.FS_LIST, { path: "workspace" })).toEqual(
      expect.arrayContaining(["workspace/release-notes.md", "workspace/todo.md"]),
    );
  });

  test("fs_read reads inside the sandbox, including the fake .env the policy guards", async () => {
    expect(await run(FilesTool.FS_READ, { path: ".env" })).toMatchObject({
      content: expect.stringContaining(FAKE_SECRET),
    });
    await expect(run(FilesTool.FS_READ, { path: "../package.json" })).rejects.toThrow("outside");
  });

  test("fs_write creates folders and records the path", async () => {
    const written: string[] = [];
    await run(FilesTool.FS_WRITE, { path: "workspace/out/s.md", content: "hi" }, written);
    expect(await readFile(join(root, "workspace/out/s.md"), "utf8")).toBe("hi");
    expect(written).toEqual(["workspace/out/s.md"]);
  });

  test("http_request posts the body and returns the status", async () => {
    expect(await run(FilesTool.HTTP_REQUEST, { url, method: "POST", body: "x=1" })).toEqual({
      status: 200,
      body: '{"ok":true}',
    });
    expect(receiver.received.at(-1)).toMatchObject({
      method: "POST",
      path: "/collect",
      body: "x=1",
    });
  });
});
