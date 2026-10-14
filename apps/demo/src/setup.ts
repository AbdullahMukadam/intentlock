import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { API_ENDPOINTS, Role } from "@intentlock/core";

import { type AdminCall, adminSession } from "./admin-api.js";
import { DemoAgent } from "./enums/demo-agent.enum.js";
import { type DemoEnv, loadEnv, required } from "./env.js";
import { hasValue, keyVar, upsertEnv } from "./env-file.js";

const DEMO_ROOT = join(import.meta.dirname, "..");
const DEMO_ENV_FILE = join(DEMO_ROOT, ".env");

const DESCRIPTIONS: Record<DemoAgent, string> = {
  [DemoAgent.GITHUB_ASSISTANT]: "Triages issues in the demo GitHub repo",
  [DemoAgent.SUPPORT_ASSISTANT]: "Answers the support inbox and issues refunds",
  [DemoAgent.FILES_ASSISTANT]: "Summarizes documents in a sandbox workspace",
};

const SUPPORT_LEAD = { email: "lead@acme-demo.dev", groups: ["support-leads"] };

type Agent = { id: string; name: string };
type PolicyState = { active: { version: number; source: string } };

async function ensureUser(call: AdminCall, email: string, groups: string[] = []) {
  const users = await call<{ email: string }[]>("GET", API_ENDPOINTS.USERS);
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    console.log(`member ${email} already exists`);
    return;
  }
  const { loginToken } = await call<{ loginToken: string }>(
    "POST",
    API_ENDPOINTS.USERS,
    {},
    { email, role: Role.enum.member, groups },
  );
  console.log(`created member ${email} (login token, shown once: ${loginToken})`);
}

async function ensureAgent(call: AdminCall, agent: DemoAgent): Promise<Agent> {
  const existing = (await call<Agent[]>("GET", API_ENDPOINTS.AGENTS)).find((a) => a.name === agent);
  if (existing) return existing;
  console.log(`creating agent ${agent}`);
  return call<Agent>(
    "POST",
    API_ENDPOINTS.AGENTS,
    {},
    {
      name: agent,
      description: DESCRIPTIONS[agent],
    },
  );
}

async function publishPolicy(call: AdminCall, agent: DemoAgent, id: string) {
  const file = join(DEMO_ROOT, "policies", `${agent}.yaml`);
  const source = await readFile(file, "utf8");
  const { active } = await call<PolicyState>("GET", API_ENDPOINTS.AGENT_POLICY, { id });
  if (active.source === source) {
    console.log(`${agent}: policy v${active.version} is already up to date`);
    return;
  }
  const published = await call<{ version: number }>(
    "POST",
    API_ENDPOINTS.AGENT_POLICY_PUBLISH,
    { id },
    {
      source,
      baseVersion: active.version,
      message: `Demo policy from apps/demo/policies/${agent}.yaml`,
    },
  );
  console.log(`${agent}: published policy v${published.version}`);
}

async function ensureKey(call: AdminCall, agent: DemoAgent, id: string, envText: string) {
  const name = keyVar(agent);
  if (hasValue(envText, name)) {
    console.log(`${agent}: API key already in apps/demo/.env (delete the line to rotate)`);
    return envText;
  }
  const { key } = await call<{ key: string }>(
    "POST",
    API_ENDPOINTS.AGENT_API_KEYS,
    { id },
    {
      name: `demo-${new Date().toISOString().slice(0, 10)}`,
    },
  );
  console.log(`${agent}: created an API key → apps/demo/.env`);
  return upsertEnv(envText, name, key);
}

async function main(env: DemoEnv) {
  const call = await adminSession(
    env.INTENTLOCK_URL,
    required(env, "INTENTLOCK_ADMIN_EMAIL"),
    required(env, "INTENTLOCK_ADMIN_TOKEN"),
  );
  await ensureUser(call, env.DEMO_USER);
  await ensureUser(call, SUPPORT_LEAD.email, SUPPORT_LEAD.groups);
  let envText = existsSync(DEMO_ENV_FILE) ? await readFile(DEMO_ENV_FILE, "utf8") : "";
  for (const agent of Object.values(DemoAgent)) {
    const { id } = await ensureAgent(call, agent);
    await publishPolicy(call, agent, id);
    envText = await ensureKey(call, agent, id, envText);
  }
  await writeFile(DEMO_ENV_FILE, envText);
  console.log("setup done");
}

main(loadEnv()).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
