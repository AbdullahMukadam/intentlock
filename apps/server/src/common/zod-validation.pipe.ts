import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";
import type { z } from "zod";

type ZodDtoClass = { schema: z.ZodType };

/**
 * Wraps a zod schema in a class so the global pipe can find it through Nest's parameter metadata:
 * `class LoginBody extends zodDto(LoginSchema) {}` then `@Body() body: LoginBody`.
 */
export function zodDto<S extends z.ZodType>(schema: S) {
  return class {
    static schema = schema;
  } as unknown as { new (): z.infer<S>; schema: S };
}

export function hasSchema(metatype: unknown): metatype is ZodDtoClass {
  return typeof metatype === "function" && "schema" in metatype;
}

/**
 * Global pipe: every `@Body()`, `@Query()` and `@Param()` must be typed with a `zodDto` class.
 * Fails closed: an argument without a schema is rejected, never passed through unchecked.
 * routes.e2e.test.ts checks every route for this as well.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, { type, metatype }: ArgumentMetadata): unknown {
    if (type === "custom") return value;
    if (!hasSchema(metatype)) throw new Error(`No zod schema for @${type}() argument`);
    const parsed = metatype.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new BadRequestException({
      statusCode: 400,
      error: "validation_failed",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
}
