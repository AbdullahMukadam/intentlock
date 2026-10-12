import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type AuditEntry,
  type AuditEntryBody,
  GENESIS,
  hashEntry,
  importPrivateKeyPem,
  STARTER_POLICY,
} from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { run } from "../program.js";
import { fakeContext } from "../testing/fake-context.js";

async function chain(n: number): Promise<AuditEntry[]> {
  const out: AuditEntry[] = [];
  let prevHash = GENESIS;
  for (let seq = 1; seq <= n; seq++) {
    const body: AuditEntryBody = {
      seq,
      orgId: "o",
      at: new Date(Date.UTC(2026, 9, 12, 9, 0, seq)).toISOString(),
      kind: "check",
      origin: "server",
      actor: null,
      user: null,
      planId: null,
      agentId: null,
      tool: "t",
      verdict: "allow",
      ruleId: null,
      policyVersion: null,
      clientSeq: null,
      clientAt: null,
      clientHash: null,
      flagged: null,
      payload: { n: seq },
      prevHash,
    };
    const hash = await hashEntry(body);
    out.push({ ...body, hash });
    prevHash = hash;
  }
  return out;
}

describe("audit verify", () => {
  test("accepts an intact export and pinpoints a tampered entry", async () => {
    const { ctx, dir, lines } = await fakeContext();
    const entries = await chain(3);
    await writeFile(join(dir, "ok.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
    expect(await run(["audit", "verify", "--file", "ok.jsonl"], ctx)).toBe(0);
    expect(lines.at(-1)).toBe("ok: 3 entries, chain intact");

    entries[1] = { ...entries[1]!, payload: { n: 99 } };
    await writeFile(join(dir, "bad.jsonl"), entries.map((e) => JSON.stringify(e)).join("\n"));
    expect(await run(["audit", "verify", "--file", "bad.jsonl"], ctx)).toBe(1);
    expect(lines.at(-1)).toMatch(/^error: Chain broken at seq 2 \(hash_mismatch\)/);
  });
});

describe("keygen", () => {
  test("writes a UTF-8 PKCS8 key the server can import and prints its kid", async () => {
    const { ctx, dir, lines } = await fakeContext();
    expect(await run(["keygen", "--out", "keys", "--env"], ctx)).toBe(0);
    const pem = await readFile(join(dir, "keys", "signing-key.pem"), "utf8");
    expect(pem.startsWith("-----BEGIN PRIVATE KEY-----")).toBe(true);
    await expect(importPrivateKeyPem(pem)).resolves.toBeDefined();
    expect(lines[0]).toMatch(/^kid [\w-]{8}$/);
    const envLine = lines.find((l) => l.startsWith("SIGNING_KEY="))!;
    expect(envLine).not.toContain("\n");
    expect(envLine).toContain("\\n");
  });
});

describe("policy validate", () => {
  test("passes a valid file and prints file:line:col for errors", async () => {
    const { ctx, dir, lines } = await fakeContext();
    await writeFile(join(dir, "good.yaml"), STARTER_POLICY);
    await writeFile(
      join(dir, "bad.yaml"),
      "version: 1\ndefault: block\nrules:\n  - id: Bad_Id\n    match: {}\n    decision: allow\n",
    );
    expect(await run(["policy", "validate", "good.yaml"], ctx)).toBe(0);
    expect(lines.at(-1)).toBe("ok: 1 rules");
    expect(await run(["policy", "validate", "bad.yaml"], ctx)).toBe(1);
    expect(lines.some((l) => /^bad\.yaml:4:\d+ /.test(l))).toBe(true);
    expect(lines.at(-1)).toBe("error: 1 error(s) in bad.yaml");
  });
});
