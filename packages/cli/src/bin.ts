#!/usr/bin/env node
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

import { run } from "./program.js";

process.exitCode = await run(process.argv.slice(2), {
  fetch,
  home: homedir(),
  cwd: process.cwd(),
  print: (line) => console.log(line),
  prompt: async (question, opts) => {
    if (!opts?.secret) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    }
    process.stdout.write(question);
    const muted = new Writable({ write: (_chunk, _enc, done) => done() });
    const rl = createInterface({ input: process.stdin, output: muted, terminal: true });
    try {
      return await rl.question("");
    } finally {
      rl.close();
      process.stdout.write("\n");
    }
  },
});
