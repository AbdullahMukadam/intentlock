import type { z } from "zod";

/**
 * Wraps a zod schema in a class so the global ZodValidationPipe can find it through Nest's
 * parameter metadata: `class LoginDto extends zodDto(schema) {}` then `@Body() body: LoginDto`.
 */
export function zodDto<S extends z.ZodType>(schema: S) {
  return class {
    static schema = schema;
  } as unknown as { new (): z.infer<S>; schema: S };
}

export function hasSchema(metatype: unknown): metatype is { schema: z.ZodType } {
  return typeof metatype === "function" && "schema" in metatype;
}
