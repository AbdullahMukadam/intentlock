// Dev seed: org, admin/approver/member users (+ intern with --demo), one agent with an API key.
// Prints the one-time login tokens and the API key. Refuses to run on a non-empty database.
import { PrismaPg } from "@prisma/adapter-pg";

import { createAgent } from "../src/agents/create-agent.js";
import { newApiKey, newSecret, sha256Hex } from "../src/common/secrets.js";
import { loadEnv } from "../src/config/env.schema.js";
import { PrismaClient, type Role } from "../src/generated/prisma/client.js";
import { orgDb } from "../src/org/org-db.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

const env = loadEnv();
const demo = process.argv.includes("--demo") || env.INTENTLOCK_DEMO;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

const domain = (env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@acme-demo.dev").split("@")[1];
const people: { email: string; role: Role; groups: string[] }[] = [
  { email: env.BOOTSTRAP_ADMIN_EMAIL ?? `admin@${domain}`, role: "admin", groups: [] },
  { email: `approver@${domain}`, role: "approver", groups: [] },
  { email: `member@${domain}`, role: "member", groups: [] },
  ...(demo ? [{ email: `intern@${domain}`, role: "member" as const, groups: ["intern"] }] : []),
];

try {
  if ((await prisma.organization.count()) > 0) {
    console.error("Database already has an organization; seed only runs on an empty database.");
    process.exitCode = 1;
  } else {
    const org = await prisma.organization.create({ data: { name: env.ORG_NAME } });
    const db = orgDb(prisma, org.id);

    const tokens: Record<string, string> = {};
    let adminId = "";
    for (const p of people) {
      const token = newSecret();
      const user = await db.user.create({
        data: { ...p, orgId: org.id, loginTokenHash: sha256Hex(token) },
      });
      if (p.role === "admin") adminId = user.id;
      tokens[p.email] = token;
    }

    const agent = await createAgent(db, org.id, { name: "github-assistant", createdBy: adminId });
    const apiKey = newApiKey(env.API_KEY_PEPPER);
    await db.apiKey.create({
      data: {
        orgId: org.id,
        agentId: agent.id,
        name: "dev",
        prefix: apiKey.prefix,
        hash: apiKey.hash,
        createdBy: adminId,
      },
    });

    console.log(`Organization: ${org.name} (${org.id})`);
    for (const [email, token] of Object.entries(tokens)) console.log(`Login ${email}  ${token}`);
    console.log(`Agent github-assistant API key  ${apiKey.key}`);
    console.log("These secrets are shown once.");
  }
} finally {
  await prisma.$disconnect();
}
