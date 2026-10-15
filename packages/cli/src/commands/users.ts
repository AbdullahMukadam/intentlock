import { API_ENDPOINTS, apiPath, Role } from "@intentlock/core";
import { type Command, Option } from "commander";

import { sessionApi } from "../api/session-api.js";
import type { CliContext } from "../types/cli-context.type.js";
import { columns } from "../utils/columns.util.js";

type User = {
  email: string;
  role: string;
  groups: string[];
  hasPassword: boolean;
  providers: string[];
  disabledAt: string | null;
};
type Link = { link: string; emailed: boolean };

function printLink(ctx: CliContext, what: string, res: Link) {
  ctx.print(`${what} (shown once): ${res.link}`);
  ctx.print(
    res.emailed
      ? "Also emailed."
      : "Not emailed (SMTP is not configured or failed); send the link yourself.",
  );
}

export function registerUsers(program: Command, ctx: CliContext) {
  const users = program.command("users").description("Manage team members (admin)");

  users
    .command("invite")
    .description("Invite someone; they set a password or continue with Google/GitHub")
    .argument("<email>")
    .addOption(new Option("--role <role>").choices(Role.options).default(Role.enum.member))
    .option("--groups <groups>", "comma-separated policy groups", "")
    .action(async (email: string, opts: { role: string; groups: string }) => {
      const api = await sessionApi(ctx);
      const groups = opts.groups
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
      const res = await api.post<Link & { invite: { email: string; role: string } }>(
        API_ENDPOINTS.INVITES,
        { email, role: opts.role, groups },
      );
      ctx.print(`Invited ${res.invite.email} (${res.invite.role}); the link is valid for 7 days`);
      printLink(ctx, "Invite link", res);
    });

  users.command("list").action(async () => {
    const list = await (await sessionApi(ctx)).get<User[]>(API_ENDPOINTS.USERS);
    for (const line of columns([
      ["EMAIL", "ROLE", "GROUPS", "SIGN-IN", "STATUS"],
      ...list.map((u) => [
        u.email,
        u.role,
        u.groups.join(",") || "-",
        [...(u.hasPassword ? ["password"] : []), ...u.providers].join(",") || "-",
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
    .command("reset-link")
    .argument("<email>")
    .description("Create a password reset link (24 h, single use)")
    .action(async (email: string) => {
      const res = await (
        await sessionApi(ctx)
      ).post<Link>(apiPath(API_ENDPOINTS.USER_RESET_LINK, { email }));
      printLink(ctx, `Reset link for ${email}`, res);
    });
}
