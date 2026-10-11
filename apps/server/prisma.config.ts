import { defineConfig } from "prisma/config";

// One .env at the repo root (docs/STRUCTURE.md §6). Missing file is fine: CI and hosts set real env vars.
try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // The CLI (migrate) uses the direct, non-pooled URL; the app connects with DATABASE_URL at runtime.
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
