import { HttpStatus } from "@nestjs/common";

import { Prisma } from "../../generated/prisma/client.js";
import { DriverErrorKind } from "../enums/driver-error-kind.enum.js";
import { PgErrorCode } from "../enums/pg-error-code.enum.js";
import { PrismaErrorCode } from "../enums/prisma-error-code.enum.js";

const TRANSIENT_PRISMA_CODES = new Set<string>([
  PrismaErrorCode.CANNOT_REACH_DATABASE,
  PrismaErrorCode.DATABASE_TIMEOUT,
  PrismaErrorCode.OPERATION_TIMED_OUT,
  PrismaErrorCode.CONNECTION_CLOSED,
  PrismaErrorCode.POOL_TIMEOUT,
  PrismaErrorCode.TRANSACTION_API_ERROR,
]);

const TRANSIENT_DRIVER_KINDS = new Set<string>([
  DriverErrorKind.DATABASE_NOT_REACHABLE,
  DriverErrorKind.CONNECTION_CLOSED,
  DriverErrorKind.SOCKET_TIMEOUT,
  DriverErrorKind.TOO_MANY_CONNECTIONS,
  DriverErrorKind.TRANSACTION_ALREADY_CLOSED,
]);

const TRANSIENT_PG_CODES = new Set<string>([
  PgErrorCode.SERIALIZATION_FAILURE,
  PgErrorCode.DEADLOCK_DETECTED,
  PgErrorCode.TOO_MANY_CONNECTIONS,
  PgErrorCode.ADMIN_SHUTDOWN,
  PgErrorCode.CRASH_SHUTDOWN,
  PgErrorCode.CANNOT_CONNECT_NOW,
]);

type DriverCause = { kind?: string; code?: string };

function driverCause(e: Prisma.PrismaClientKnownRequestError): DriverCause | undefined {
  const meta = e.meta as { driverAdapterError?: { cause?: DriverCause } } | undefined;
  return meta?.driverAdapterError?.cause;
}

function isTransientPg(code: string | undefined): boolean {
  return (
    code !== undefined &&
    (TRANSIENT_PG_CODES.has(code) || code.startsWith(PgErrorCode.CONNECTION_EXCEPTION_CLASS))
  );
}

export function dbErrorStatus(
  e: unknown,
): HttpStatus.SERVICE_UNAVAILABLE | HttpStatus.CONFLICT | null {
  if (e instanceof Prisma.PrismaClientInitializationError) return HttpStatus.SERVICE_UNAVAILABLE;
  if (!(e instanceof Prisma.PrismaClientKnownRequestError)) return null;
  if (e.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) return HttpStatus.CONFLICT;
  if (TRANSIENT_PRISMA_CODES.has(e.code)) return HttpStatus.SERVICE_UNAVAILABLE;
  const cause = driverCause(e);
  if (cause?.kind !== undefined && TRANSIENT_DRIVER_KINDS.has(cause.kind)) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  if (cause?.kind === DriverErrorKind.POSTGRES && isTransientPg(cause.code)) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  return null;
}
