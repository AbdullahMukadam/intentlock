import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

const PACKAGES = ["core", "sdk", "guard", "anthropic", "mcp-proxy"];
const FILTER = "./packages/{core,sdk,guard,anthropic,mcp-proxy}";
const BRANCH = "main";
const ROOT = join(import.meta.dirname, "..");

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const dryRun = values["dry-run"];

const NEEDS_SHELL_ON_WINDOWS = new Set(["pnpm", "npm"]);

function run(cmd: string, args: string[], opts: { capture?: boolean; allowFail?: boolean } = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    shell: process.platform === "win32" && NEEDS_SHELL_ON_WINDOWS.has(cmd),
    encoding: "utf8",
    stdio: opts.capture ? ["inherit", "pipe", "pipe"] : "inherit",
  });
  if (res.status !== 0 && !opts.allowFail) {
    fail(`\`${cmd} ${args.join(" ")}\` failed${opts.capture ? `:\n${res.stderr}` : ""}`);
  }
  return { ok: res.status === 0, out: (res.stdout ?? "").trim() };
}

function fail(message: string): never {
  console.error(`\nrelease stopped: ${message}`);
  process.exit(1);
}

function step(title: string) {
  console.log(`\n== ${title}`);
}

step("Versions");
const versions = PACKAGES.map((p) => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "packages", p, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  console.log(`${pkg.name} ${pkg.version}`);
  return pkg.version;
});
const version = versions[0]!;
if (versions.some((v) => v !== version))
  fail("the published packages must have the same version (ADR-062, ADR-071)");
const tag = `v${version}`;

step("Release files");
const pinned: [string, string][] = [
  ["deploy/docker-compose.selfhost.yml", `\${INTENTLOCK_VERSION:-${version}}`],
  ["deploy/selfhost.env.example", `INTENTLOCK_VERSION=${version}`],
  ["CHANGELOG.md", `## ${version} · `],
];
for (const [file, expected] of pinned) {
  if (!readFileSync(join(ROOT, file), "utf8").includes(expected)) {
    fail(`${file} must contain \`${expected}\` (see CONTRIBUTING "Releasing")`);
  }
}
console.log(`self-host bundle and CHANGELOG.md are at ${version}`);

step("Git");
const branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { capture: true }).out;
if (branch !== BRANCH) fail(`on branch ${branch}; switch to ${BRANCH} first`);
if (run("git", ["status", "--porcelain"], { capture: true }).out !== "") {
  fail("the working tree has uncommitted changes");
}
run("git", ["fetch", "origin", BRANCH, "--tags"], { capture: true });
const head = run("git", ["rev-parse", "HEAD"], { capture: true }).out;
const remote = run("git", ["rev-parse", `origin/${BRANCH}`], { capture: true }).out;
if (head !== remote) fail(`HEAD is not origin/${BRANCH}; run git pull (or push) first`);
if (
  run("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
    capture: true,
    allowFail: true,
  }).ok
) {
  fail(`tag ${tag} already exists; bump the versions for a new release`);
}
console.log(`on ${BRANCH} at ${head.slice(0, 7)}, clean, tag ${tag} is free`);

step("npm");
const user = run("npm", ["whoami"], { capture: true, allowFail: true });
if (!user.ok) fail("not logged in to npm; run `npm login` (and create the intentlock org first)");
console.log(`logged in as ${user.out}`);
const alreadyPublished = PACKAGES.filter((p) => {
  const published = run("npm", ["view", `@intentlock/${p}@${version}`, "version"], {
    capture: true,
    allowFail: true,
  });
  return published.ok && published.out === version;
});
const publishNeeded = alreadyPublished.length < PACKAGES.length;
if (alreadyPublished.length === 0) console.log(`${version} is not on npm yet`);
else if (publishNeeded) {
  console.log(
    `already on npm at ${version}: ${alreadyPublished.join(", ")} (an earlier run stopped partway); pnpm skips those and publishes the rest`,
  );
} else console.log(`all packages are already on npm at ${version}; only the tag is left`);

if (publishNeeded) {
  step("Build");
  run("pnpm", ["turbo", "run", "build", ...PACKAGES.map((p) => `--filter=@intentlock/${p}`)]);

  step("Dry run (check each package lists only dist/, README.md, LICENSE, package.json)");
  run("pnpm", ["-r", "--filter", FILTER, "publish", "--dry-run"]);
}

if (dryRun) {
  console.log(`\ndry run only: nothing was published and ${tag} was not created`);
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(
  publishNeeded
    ? `\nPublish ${PACKAGES.map((p) => `@intentlock/${p}`).join(", ")} at ${version} to npm and push tag ${tag}? Type yes: `
    : `\nPush tag ${tag}? Type yes: `,
);
rl.close();
if (answer.trim() !== "yes") fail("not confirmed");

if (publishNeeded) {
  step("Publish (npm asks for your 2FA code)");
  run("pnpm", ["-r", "--filter", FILTER, "publish"]);
}

step("Tag");
run("git", ["tag", "-a", tag, "-m", `Intentlock ${version}`]);
run("git", ["push", "origin", tag]);

console.log(`
Released ${version}.
- Check: npm view @intentlock/guard version
- CI (Actions tab) now pushes the server and inbox images as ${version} and ${version.split(".").slice(0, 2).join(".")}
- Optional release page: gh release create ${tag} --title "Intentlock ${version}" --generate-notes`);
