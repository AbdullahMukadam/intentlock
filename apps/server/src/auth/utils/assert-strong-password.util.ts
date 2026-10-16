import { BadRequestException, HttpStatus } from "@nestjs/common";

import { AuthError } from "../enums/auth-error.enum.js";
import { isWeakPassword } from "./password.util.js";

export function assertStrongPassword(email: string, password: string) {
  if (isWeakPassword(email, password)) {
    throw new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      error: AuthError.PASSWORD_TOO_WEAK,
    });
  }
}
