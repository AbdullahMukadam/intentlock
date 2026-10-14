import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client.js";
import { LogLevel } from "../../src/config/enums/log-level.enum.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // CI sets env vars directly
}
process.env["DATABASE_URL"] = process.env["TEST_DATABASE_URL"];
process.env["LOG_LEVEL"] ??= LogLevel.SILENT;

export function testPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env["TEST_DATABASE_URL"]! }),
  });
}

// Safe only because e2e files run one at a time (vitest.config.ts).
export async function resetDb(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
