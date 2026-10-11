import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

import { hasSchema } from "../utils/zod-dto.util.js";

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
