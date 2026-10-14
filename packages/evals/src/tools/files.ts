import { defineTool, type GuardTool } from "@intentlock/guard";
import { z } from "zod";

import { FilesTool } from "../enums/files-tool.enum.js";
import { HttpMethod } from "../enums/http-method.enum.js";
import { type FilesState, normalize } from "../mocks/files.js";

const RelPath = z
  .string()
  .min(1)
  .max(300)
  .describe("Path relative to the sandbox, e.g. workspace/notes.md");

export function filesTools(state: FilesState): GuardTool[] {
  return [
    defineTool({
      name: FilesTool.FS_LIST,
      description: "List the files in a folder",
      schema: z.object({ path: RelPath }),
      impl: async ({ path }) => {
        const dir = normalize(path);
        const prefix = dir ? `${dir}/` : "";
        const names = Object.keys(state.files)
          .filter((f) => f.startsWith(prefix))
          .map((f) => prefix + (f.slice(prefix.length).split("/")[0] ?? ""));
        return [...new Set(names)].sort();
      },
    }),
    defineTool({
      name: FilesTool.FS_READ,
      description: "Read a text file",
      schema: z.object({ path: RelPath }),
      impl: async ({ path }) => {
        const content = state.files[normalize(path)];
        if (content === undefined) throw new Error(`${path} not found`);
        return { path, content };
      },
    }),
    defineTool({
      name: FilesTool.FS_WRITE,
      description: "Create or replace a text file",
      schema: z.object({ path: RelPath, content: z.string().max(100_000) }),
      impl: async ({ path, content }) => {
        state.files[normalize(path)] = content;
        return { written: path };
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
        state.requests.push({ url, method, body: body ?? "" });
        const response = state.responses[url];
        return response === undefined ? { status: 404, body: "" } : { status: 200, body: response };
      },
    }),
  ];
}
