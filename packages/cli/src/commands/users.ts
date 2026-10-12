import { API_ENDPOINTS, apiPath, Role } from "@intentlock/core";
import { type Command, Option } from "commander";

import { sessionApi } from "../api/session-api.js";
import type { CliContext } from "../types/cli-context.type.js";
import { columns } from "../utils/columns.util.js";

type User = { email: string; role: string; groups: string[]; disabledAt: string | null };

export function registerUsers(program: Command, ctx: CliContext) {
  const users = program.command("users").description("Manage team members (admin)");

  users
    .command("add")
    .argument("<email>")
    .addOption(new Option("--role <role>").choices(Role.options).default(Role.enum.member))
    .option("--groups <groups>", "comma-separated policy groups", "")
    .action(async (email: string, opts: { role: string; groups: string }) => {
      const api = await sessionApi(ctx);
      const groups = opts.groups
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
      const res = await api.post<{ user: User; loginToken: string }>(API_ENDPOINTS.USERS, {
        email,
        role: opts.role,
        groups,
      });
      ctx.print(`Added ${res.user.email} (${res.user.role})`);
      ctx.print(`Login token (shown once): ${res.loginToken}`);
    });

  users.command("list").action(async () => {
    const list = await (await sessionApi(ctx)).get<User[]>(API_ENDPOINTS.USERS);
    for (const line of columns([
      ["EMAIL", "ROLE", "GROUPS", "STATUS"],
      ...list.map((u) => [
        u.email,
        u.role,
        u.groups.join(",") || "-",
        u.disabledAt ? "disabled" : "active",
      ]),
    ])) {
      ctx.print(line);
    }
  });

  users
    .command("disable")
    .argument("<email>")
    .action(async (email: string) => {
      await (
        await sessionApi(ctx)
      ).patch(apiPath(API_ENDPOINTS.USER, { email }), { disabled: true });
      ctx.print(`Disabled ${email}; their sessions are ended`);
    });

  users
    .command("token")
    .argument("<email>")
    .description("Issue a new login token (the old one and all sessions stop working)")
    .action(async (email: string) => {
      const res = await (
        await sessionApi(ctx)
      ).post<{ loginToken: string }>(apiPath(API_ENDPOINTS.USER_TOKEN, { email }));
      ctx.print(`Login token for ${email} (shown once): ${res.loginToken}`);
    });
}
