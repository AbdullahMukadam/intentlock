import { execSync } from "node:child_process";

export default function setup() {
  try {
    process.loadEnvFile("../../.env");
  } catch {
    // CI sets env vars directly
  }
  const url = process.env["TEST_DATABASE_URL"];
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  process.env["DATABASE_URL"] = url;
  process.env["DIRECT_URL"] = url;
  execSync("pnpm prisma migrate deploy", { stdio: "pipe", env: process.env });
}
