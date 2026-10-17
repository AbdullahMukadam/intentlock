import { defineConfig } from "prisma/config";

import { loadEnvFiles } from "./src/config/load-env-files.util.js";

loadEnvFiles();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});
