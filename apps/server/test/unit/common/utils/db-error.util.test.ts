import { HttpStatus } from "@nestjs/common";

import { dbErrorStatus } from "../../../../src/common/utils/db-error.util.js";
import { Prisma } from "../../../../src/generated/prisma/client.js";

function known(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("db", { code, clientVersion: "7", meta });
}

function driver(cause: Record<string, unknown>) {
  return { driverAdapterError: { name: "DriverAdapterError", cause } };
}

describe("dbErrorStatus", () => {
  it.each([
    ["unreachable on a model query", known("P1001", driver({ kind: "DatabaseNotReachable" }))],
    ["unreachable on a raw query", known("P2010", driver({ kind: "DatabaseNotReachable" }))],
    ["transaction could not start in time", known("P2028")],
    ["expired transaction", known("P2028", { operation: "query", timeout: 5000 })],
    [
      "connection terminated by the server",
      known("P2010", driver({ kind: "postgres", code: "57P01" })),
    ],
    ["connection exception class", known("P2010", driver({ kind: "postgres", code: "08006" }))],
    ["deadlock", known("P2010", driver({ kind: "postgres", code: "40P01" }))],
    ["engine pool timeout", known("P2024")],
  ])("treats %s as unavailable", (_, error) => {
    expect(dbErrorStatus(error)).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it("treats a unique violation as a conflict", () => {
    expect(dbErrorStatus(known("P2002"))).toBe(HttpStatus.CONFLICT);
  });

  it("leaves bugs and other errors alone", () => {
    expect(dbErrorStatus(known("P2010", driver({ kind: "postgres", code: "42P01" })))).toBeNull();
    expect(dbErrorStatus(known("P2025"))).toBeNull();
    expect(dbErrorStatus(new Error("boom"))).toBeNull();
    expect(dbErrorStatus(undefined)).toBeNull();
  });
});
