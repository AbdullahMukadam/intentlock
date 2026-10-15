import { z } from "zod";

import { LogLevel } from "./enums/log-level.enum.js";
import { NodeEnv } from "./enums/node-env.enum.js";

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

export const Env = z.object({
  NODE_ENV: z.enum(NodeEnv).default(NodeEnv.DEVELOPMENT),
  PORT: z.coerce.number().int().positive().default(3000),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  DATABASE_URL: z.string().url(),
  SIGNING_KEY: optional,
  SIGNING_KEY_PREVIOUS: optional,
  API_KEY_PEPPER: z.string().default(""),
  ORG_NAME: z.string().min(1).default("Intentlock"),
  BOOTSTRAP_ADMIN_EMAIL: optional.pipe(z.string().email().optional()),
  LICENSE_FILE: optional,
  PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGINS: optional,
  INTENTLOCK_DEMO: z
    .enum(["0", "1", ""])
    .default("0")
    .transform((v) => v === "1"),
  LOG_LEVEL: z.enum(LogLevel).default(LogLevel.INFO),
});
export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = Env.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${fields}`);
  }
  return parsed.data;
}
