import { Command } from "commander";

import { registerAgents } from "./commands/agents.js";
import { registerAuditVerify } from "./commands/audit-verify.js";
import { registerKeygen } from "./commands/keygen.js";
import { registerKeys } from "./commands/keys.js";
import { registerLogin } from "./commands/login.js";
import { registerPolicy } from "./commands/policy.js";
import { registerUsers } from "./commands/users.js";
import { CliError } from "./errors.js";
import type { CliContext } from "./types/cli-context.type.js";

export function buildProgram(ctx: CliContext): Command {
  const program = new Command("intentlock").description("Intentlock command line").exitOverride();
  program.configureOutput({
    writeOut: (s) => ctx.print(s.trimEnd()),
    writeErr: (s) => ctx.print(s.trimEnd()),
  });
  registerAuditVerify(program, ctx);
  registerKeygen(program, ctx);
  registerLogin(program, ctx);
  registerUsers(program, ctx);
  registerAgents(program, ctx);
  registerKeys(program, ctx);
  registerPolicy(program, ctx);
  return program;
}

export async function run(argv: string[], ctx: CliContext): Promise<number> {
  try {
    await buildProgram(ctx).parseAsync(argv, { from: "user" });
    return 0;
  } catch (err) {
    if (err instanceof CliError) {
      ctx.print(`error: ${err.message}`);
      return 1;
    }
    if (err && typeof err === "object" && "exitCode" in err && typeof err.exitCode === "number") {
      return err.exitCode;
    }
    throw err;
  }
}
