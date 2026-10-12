import type { z } from "zod";

// Gives a zod schema a class so the global pipe can find it through parameter metadata.
export function zodDto<S extends z.ZodType>(schema: S) {
  return class {
    static schema = schema;
  } as unknown as { new (): z.infer<S>; schema: S };
}

export function hasSchema(metatype: unknown): metatype is { schema: z.ZodType } {
  return typeof metatype === "function" && "schema" in metatype;
}
