#!/usr/bin/env node
import { homedir } from "node:os";
import { createInterface } from "node:readline/promises";

import { run } from "./program.js";

process.exitCode = await run(process.argv.slice(2), {
  fetch,
  home: homedir(),
  cwd: process.cwd(),
  print: (line) => console.log(line),
  prompt: async (question) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(question);
    } finally {
      rl.close();
    }
  },
});
