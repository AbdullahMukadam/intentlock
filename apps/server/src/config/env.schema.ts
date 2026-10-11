import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

// DEPLOYMENT §2. The server refuses to start on invalid config.
export const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
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
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
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
