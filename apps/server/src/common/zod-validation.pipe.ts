import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/** Usage: `@Body(new ZodValidationPipe(Schema)) body: Schema`. */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new BadRequestException({
      statusCode: 400,
      error: "validation_failed",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
}
