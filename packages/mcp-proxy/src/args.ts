import { parseArgs } from "node:util";

export interface ProxyArgs {
  plan?: string;
  user?: string;
  listTools: boolean;
  command: string;
  commandArgs: string[];
}

export const USAGE = `Usage: intentlock-mcp --plan <plan.json> [--user <email>] -- <upstream command> [args...]
       intentlock-mcp --list-tools -- <upstream command> [args...]`;

export function wantsHelp(argv: string[]): boolean {
  const split = argv.indexOf("--");
  const own = split === -1 ? argv : argv.slice(0, split);
  return own.includes("--help") || own.includes("-h");
}

export function parseProxyArgs(argv: string[]): ProxyArgs {
  const split = argv.indexOf("--");
  if (split === -1 || split === argv.length - 1)
    throw new Error(`Missing upstream command.\n${USAGE}`);
  const { values } = parseArgs({
    args: argv.slice(0, split),
    options: {
      plan: { type: "string" },
      user: { type: "string" },
      "list-tools": { type: "boolean", default: false },
    },
    strict: true,
  });
  const listTools = values["list-tools"] ?? false;
  if (!listTools && !values.plan) throw new Error(`Missing --plan.\n${USAGE}`);
  const [command, ...commandArgs] = argv.slice(split + 1) as [string, ...string[]];
  return {
    ...(values.plan !== undefined && { plan: values.plan }),
    ...(values.user !== undefined && { user: values.user }),
    listTools,
    command,
    commandArgs,
  };
}
