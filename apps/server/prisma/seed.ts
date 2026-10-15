// Dev only: prints one-time secrets and refuses to run on a non-empty database.
import { PrismaPg } from "@prisma/adapter-pg";

import { newApiKey } from "../src/agents/api-keys/utils/api-key.util.js";
import { createAgent } from "../src/agents/utils/create-agent.util.js";
import { hashPassword } from "../src/auth/utils/password.util.js";
import { newSecret } from "../src/common/utils/crypto.util.js";
import { loadEnv } from "../src/config/env.schema.js";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { bootstrapOrg } from "../src/org/utils/bootstrap-org.util.js";
import { createDemoUsers } from "../src/org/utils/create-demo-users.util.js";
import { orgDb } from "../src/org/utils/org-db.util.js";
import { UserRole } from "../src/users/enums/user-role.enum.js";

try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file
}

const env = loadEnv();
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
const adminEmail = (process.env["INTENTLOCK_ADMIN_EMAIL"] || "admin@acme-demo.dev").toLowerCase();

try {
  const result = await bootstrapOrg(prisma, { orgName: env.ORG_NAME });
  if (!result) {
    console.error("Database already has users; seed only runs on an empty database.");
    process.exitCode = 1;
  } else {
    const { orgId } = result;
    const db = orgDb(prisma, orgId);
    const adminPassword = newSecret();
    const admin = await db.user.create({
      data: {
        orgId,
        email: adminEmail,
        role: UserRole.ADMIN,
        passwordHash: await hashPassword(adminPassword),
      },
    });
    await prisma.organization.update({ where: { id: orgId }, data: { setupCodeHash: null } });
    const passwords = {
      [adminEmail]: adminPassword,
      ...(await createDemoUsers(db, orgId, adminEmail.split("@")[1] ?? "example.com")),
    };
    const agent = await createAgent(db, orgId, { name: "github-assistant", createdBy: admin.id });
    const apiKey = newApiKey(env.API_KEY_PEPPER);
    await db.apiKey.create({
      data: {
        orgId,
        agentId: agent.id,
        name: "dev",
        prefix: apiKey.prefix,
        hash: apiKey.hash,
        createdBy: admin.id,
      },
    });

    for (const [email, password] of Object.entries(passwords)) {
      console.log(`Password ${email}  ${password}`);
    }
    console.log(`Agent github-assistant API key  ${apiKey.key}`);
    console.log("These secrets are shown once.");
  }
} finally {
  await prisma.$disconnect();
}
