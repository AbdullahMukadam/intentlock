import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { defineTool, type GuardTool } from "@intentlock/guard";
import { z } from "zod";

import { FilesTool } from "./enums/files-tool.enum.js";
import { HttpMethod } from "./enums/http-method.enum.js";

const MAX_FILE_CHARS = 20_000;
const HTTP_TIMEOUT_MS = 5_000;

const RelPath = z
  .string()
  .min(1)
  .max(300)
  .describe("Path relative to the sandbox, e.g. workspace/notes.md");

export function inSandbox(root: string, path: string) {
  const full = resolve(root, path);
  const rel = relative(root, full);
  if (isAbsolute(path) || rel.startsWith(`..${sep}`) || rel === "..") {
    throw new Error(`${path} is outside the sandbox`);
  }
  return full;
}

export function filesTools(root: string, written: string[] = []): GuardTool[] {
  return [
    defineTool({
      name: FilesTool.FS_LIST,
      description: "List the files in a folder",
      schema: z.object({ path: RelPath }),
      impl: async ({ path }) => {
        const entries = await readdir(inSandbox(root, path), { withFileTypes: true });
        return entries.map(
          (e) => `${path.replace(/\/$/, "")}/${e.name}${e.isDirectory() ? "/" : ""}`,
        );
      },
    }),
    defineTool({
      name: FilesTool.FS_READ,
      description: "Read a text file",
      schema: z.object({ path: RelPath }),
      impl: async ({ path }) => ({
        path,
        content: (await readFile(inSandbox(root, path), "utf8")).slice(0, MAX_FILE_CHARS),
      }),
    }),
    defineTool({
      name: FilesTool.FS_WRITE,
      description: "Create or replace a text file",
      schema: z.object({ path: RelPath, content: z.string().max(100_000) }),
      impl: async ({ path, content }) => {
        const full = inSandbox(root, path);
        await mkdir(dirname(full), { recursive: true });
        await writeFile(full, content);
        written.push(path);
        return { written: path, bytes: Buffer.byteLength(content) };
      },
    }),
    defineTool({
      name: FilesTool.HTTP_REQUEST,
      description: "Send an HTTP request and return the status and response text",
      schema: z.object({
        url: z.url(),
        method: z.enum(HttpMethod).default(HttpMethod.GET),
        body: z.string().max(100_000).optional(),
      }),
      impl: async ({ url, method, body }) => {
        const res = await fetch(url, {
          method,
          ...(body !== undefined && method !== HttpMethod.GET && { body }),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        });
        return { status: res.status, body: (await res.text()).slice(0, MAX_FILE_CHARS) };
      },
    }),
  ];
}
