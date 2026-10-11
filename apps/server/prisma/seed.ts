// Dev seed: org, admin + sample users (approver, member, intern), one agent with an API key.
// Prints the one-time login tokens and the API key. Refuses to run on a non-empty database.
import { PrismaPg } from "@prisma/adapter-pg";

import { createAgent } from "../src/agents/create-agent.js";
import { newApiKey } from "../src/common/secrets.js";
import { loadEnv } from "../src/config/env.schema.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { bootstrapOrg } from "../src/org/bootstrap.js";
import { orgDb } from "../src/org/org-db.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

const env = loadEnv();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

try {
  const result = await bootstrapOrg(prisma, {
    orgName: env.ORG_NAME,
    adminEmail: env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@acme-demo.dev",
    demo: true,
  });
  if (!result?.adminId) {
    console.error("Database already has an organization; seed only runs on an empty database.");
    process.exitCode = 1;
  } else {
    const { orgId, adminId } = result;
    const db = orgDb(prisma, orgId);
    const agent = await createAgent(db, orgId, { name: "github-assistant", createdBy: adminId });
    const apiKey = newApiKey(env.API_KEY_PEPPER);
    await db.apiKey.create({
      data: {
        orgId,
        agentId: agent.id,
        name: "dev",
        prefix: apiKey.prefix,
        hash: apiKey.hash,
        createdBy: adminId,
      },
    });

    for (const [email, token] of Object.entries(result.tokens)) {
      console.log(`Login ${email}  ${token}`);
    }
    console.log(`Agent github-assistant API key  ${apiKey.key}`);
    console.log("These secrets are shown once.");
  }
} finally {
  await prisma.$disconnect();
}
