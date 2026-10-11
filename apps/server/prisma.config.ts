import { defineConfig } from "prisma/config";

// Missing root .env is fine: CI and hosts set real env vars.
try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  // The CLI (migrate) uses the direct, non-pooled URL; the app connects with DATABASE_URL at runtime.
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
