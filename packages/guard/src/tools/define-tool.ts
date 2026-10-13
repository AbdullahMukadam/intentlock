import { z } from "zod";

import type { ToolImpl } from "../guard/options.js";
import type { ToolDef } from "../provider/types.js";

export interface GuardTool extends ToolDef {
  impl: ToolImpl;
}

export function defineTool<S extends z.ZodObject>(spec: {
  name: string;
  description: string;
  schema: S;
  impl: (args: z.output<S>) => Promise<unknown>;
}): GuardTool {
  const { $schema: _, ...inputSchema } = z.toJSONSchema(spec.schema, { io: "input" });
  return {
    name: spec.name,
    description: spec.description,
    inputSchema,
    impl: async (args) => {
      const parsed = spec.schema.safeParse(args);
      if (!parsed.success) throw new Error(`Invalid arguments: ${z.prettifyError(parsed.error)}`);
      return spec.impl(parsed.data);
    },
  };
}

export function toolset(tools: GuardTool[]): { tools: ToolDef[]; impls: Record<string, ToolImpl> } {
  return {
    tools: tools.map(({ impl: _, ...def }) => def),
    impls: Object.fromEntries(tools.map((t) => [t.name, t.impl])),
  };
}
