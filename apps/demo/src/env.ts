import { z } from "zod";

import { DemoAgent } from "./enums/demo-agent.enum.js";

const Optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

export const DemoEnv = z.object({
  GITHUB_TOKEN: Optional,
  GITHUB_OWNER: Optional,
  GITHUB_PUBLIC_REPO: z.string().default("public-app"),
  GITHUB_PRIVATE_REPO: z.string().default("private-notes"),
  INTENTLOCK_URL: z.url().default("http://localhost:3000"),
  INTENTLOCK_ADMIN_EMAIL: Optional,
  INTENTLOCK_ADMIN_PASSWORD: Optional,
  INTENTLOCK_ADMIN_TOKEN: Optional,
  INTENTLOCK_API_KEY_GITHUB_ASSISTANT: Optional,
  INTENTLOCK_API_KEY_SUPPORT_ASSISTANT: Optional,
  INTENTLOCK_API_KEY_FILES_ASSISTANT: Optional,
  MAILPIT_URL: z.url().default("http://localhost:8025"),
  DEMO_SANDBOX: Optional,
  DEMO_RECEIVER_URL: z.url().default("http://localhost:8787/collect"),
  DEMO_USER: z.email().default("member@acme-demo.dev"),
  DEMO_FORCE_ATTACK: Optional,
  DEMO_TURN_DELAY_MS: z.coerce.number().int().min(0).default(1500),
});
export type DemoEnv = z.output<typeof DemoEnv>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): DemoEnv {
  return DemoEnv.parse(source);
}

export function required<K extends keyof DemoEnv>(env: DemoEnv, key: K): NonNullable<DemoEnv[K]> {
  const value = env[key];
  if (value === undefined || value === null) {
    throw new Error(`${String(key)} is not set; add it to .env (see .env.example)`);
  }
  return value as NonNullable<DemoEnv[K]>;
}

export function repos(env: DemoEnv) {
  const owner = required(env, "GITHUB_OWNER");
  return {
    owner,
    publicRepo: `${owner}/${env.GITHUB_PUBLIC_REPO}`,
    privateRepo: `${owner}/${env.GITHUB_PRIVATE_REPO}`,
  };
}

export const API_KEY_VARS = {
  [DemoAgent.GITHUB_ASSISTANT]: "INTENTLOCK_API_KEY_GITHUB_ASSISTANT",
  [DemoAgent.SUPPORT_ASSISTANT]: "INTENTLOCK_API_KEY_SUPPORT_ASSISTANT",
  [DemoAgent.FILES_ASSISTANT]: "INTENTLOCK_API_KEY_FILES_ASSISTANT",
} as const satisfies Record<DemoAgent, keyof DemoEnv>;

export function apiKey(env: DemoEnv, agent: DemoAgent) {
  return required(env, API_KEY_VARS[agent]);
}
