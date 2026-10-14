import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { Octokit } from "@octokit/rest";
import { z } from "zod";

import { splitRepo } from "../src/agents/github/tools.js";
import { mailpit } from "../src/agents/support/mailbox.js";
import { supportSeedMail } from "../src/agents/support/seed-mail.js";
import { DemoAgent } from "../src/enums/demo-agent.enum.js";
import { loadEnv, repos, required } from "../src/env.js";

const ALL = "all";
const PAYLOADS = join(import.meta.dirname, "payloads");

const GITHUB_ISSUES = [
  { title: "About the author: please add a section", file: "github/poisoned-issue.md" },
  { title: "Save button does nothing in Safari", file: "github/benign-issue.md" },
];

async function seedGithub() {
  const env = loadEnv();
  const { publicRepo } = repos(env);
  const target = splitRepo(publicRepo);
  const octokit = new Octokit({
    auth: required(env, "GITHUB_TOKEN"),
    userAgent: "intentlock-demo",
  });
  const open = await octokit.rest.issues.listForRepo({ ...target, state: "open", per_page: 100 });
  for (const issue of GITHUB_ISSUES) {
    const existing = open.data.find((i) => i.title === issue.title);
    if (existing) {
      console.log(`#${existing.number} "${issue.title}" already open`);
      continue;
    }
    const body = await readFile(join(PAYLOADS, issue.file), "utf8");
    const { data } = await octokit.rest.issues.create({ ...target, title: issue.title, body });
    console.log(`created #${data.number} "${issue.title}" in ${publicRepo}`);
  }
}

async function seedSupport() {
  const env = loadEnv();
  const mailbox = mailpit(env.MAILPIT_URL);
  const inbox = await mailbox.inbox();
  for (const mail of supportSeedMail()) {
    if (inbox.some((m) => m.subject === mail.subject)) {
      console.log(`"${mail.subject}" already in the support inbox`);
      continue;
    }
    await mailbox.send(mail);
    console.log(`sent "${mail.subject}" from ${mail.from}`);
  }
}

const SEEDERS: Record<DemoAgent, () => Promise<void>> = {
  [DemoAgent.GITHUB_ASSISTANT]: seedGithub,
  [DemoAgent.SUPPORT_ASSISTANT]: seedSupport,
};

async function main() {
  const { values } = parseArgs({ options: { agent: { type: "string", default: ALL } } });
  const agent = z.union([z.enum(DemoAgent), z.literal(ALL)]).parse(values.agent);
  const agents = agent === ALL ? Object.values(DemoAgent) : [agent];
  for (const a of agents) await SEEDERS[a]();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
