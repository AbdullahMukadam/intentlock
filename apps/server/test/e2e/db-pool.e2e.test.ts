import { HttpStatus } from "@nestjs/common";

import { dbErrorStatus } from "../../src/common/utils/db-error.util.js";
import { loadEnv } from "../../src/config/env.schema.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";

function tinyPool(overrides: Record<string, string>) {
  return new PrismaService(
    loadEnv({
      DATABASE_URL: process.env["TEST_DATABASE_URL"],
      DATABASE_POOL_MAX: "1",
      ...overrides,
    }),
  );
}

async function errorWhileBusy(db: PrismaService, query: () => Promise<unknown>) {
  await db.$queryRaw`SELECT 1`;
  const busy = db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_sleep(1)`;
  });
  await new Promise((r) => setTimeout(r, 100));
  const error = await query().then(
    () => null,
    (e: unknown) => e,
  );
  await busy;
  return error;
}

describe("PrismaService pool and transaction limits", () => {
  it("fails a query that waits longer than DATABASE_POOL_TIMEOUT_MS, as unavailable", async () => {
    const db = tinyPool({ DATABASE_POOL_TIMEOUT_MS: "200" });
    try {
      const error = await errorWhileBusy(db, () => db.user.findFirst());
      expect(dbErrorStatus(error)).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    } finally {
      await db.$disconnect();
    }
  });

  it("fails a transaction that waits longer than DATABASE_TX_MAX_WAIT_MS, as unavailable", async () => {
    const db = tinyPool({ DATABASE_TX_MAX_WAIT_MS: "200" });
    try {
      const error = await errorWhileBusy(db, () => db.$transaction((tx) => tx.user.findFirst()));
      expect(dbErrorStatus(error)).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    } finally {
      await db.$disconnect();
    }
  });
});
