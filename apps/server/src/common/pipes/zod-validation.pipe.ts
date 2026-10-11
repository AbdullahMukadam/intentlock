import {
  type ArgumentMetadata,
  BadRequestException,
  HttpStatus,
  Injectable,
  type PipeTransform,
} from "@nestjs/common";

import { ErrorCode } from "../enums/error-code.enum.js";
import { hasSchema } from "../utils/zod-dto.util.js";

// Fails closed: a @Body/@Query/@Param without a zodDto schema is rejected, never passed through.
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, { type, metatype }: ArgumentMetadata): unknown {
    if (type === "custom") return value;
    if (!hasSchema(metatype)) throw new Error(`No zod schema for @${type}() argument`);
    const parsed = metatype.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      error: ErrorCode.VALIDATION_FAILED,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
}
