import { chmod, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  exportPrivateKeyPem,
  exportPublicKeyPem,
  generateSigningKeyPair,
  keyId,
} from "@intentlock/core";
import type { Command } from "commander";

import { DEFAULT_KEYS_DIR, SIGNING_KEY_FILE } from "../constants/cli.constants.js";
import type { CliContext } from "../types/cli-context.type.js";

export function registerKeygen(program: Command, ctx: CliContext) {
  program
    .command("keygen")
    .description("Create an Ed25519 signing key (PKCS8 PEM) for SIGNING_KEY")
    .option("--out <dir>", "directory to write the key into", DEFAULT_KEYS_DIR)
    .option("--env", "also print the one-line SIGNING_KEY value for .env")
    .action(async (opts: { out: string; env?: boolean }) => {
      const { privateKey, publicKey } = await generateSigningKeyPair();
      const dir = resolve(ctx.cwd, opts.out);
      await mkdir(dir, { recursive: true });
      const privatePath = resolve(dir, SIGNING_KEY_FILE);
      const privatePem = await exportPrivateKeyPem(privateKey);
      await writeFile(privatePath, privatePem, { encoding: "utf8", mode: 0o600 });
      await chmod(privatePath, 0o600);
      await writeFile(
        resolve(dir, "signing-key.pub.pem"),
        await exportPublicKeyPem(publicKey),
        "utf8",
      );
      ctx.print(`kid ${await keyId(publicKey)}`);
      ctx.print(`private key ${privatePath} (keep secret, never commit)`);
      if (opts.env) ctx.print(`SIGNING_KEY="${privatePem.trim().replaceAll("\n", "\\n")}\\n"`);
    });
}
