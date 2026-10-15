import { BadRequestException, HttpStatus } from "@nestjs/common";

import { AuthError } from "../enums/auth-error.enum.js";

export function linkInvalid() {
  return new BadRequestException({
    statusCode: HttpStatus.BAD_REQUEST,
    error: AuthError.LINK_INVALID,
  });
}
