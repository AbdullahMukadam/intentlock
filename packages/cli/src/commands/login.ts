import { API_ENDPOINTS } from "@intentlock/core";
import type { Command } from "commander";

import { readResponse, send } from "../api/api-client.js";
import { CSRF_HEADER, SESSION_COOKIE } from "../constants/cli.constants.js";
import { HttpMethod } from "../enums/http-method.enum.js";
import { CliError } from "../errors.js";
import { saveSession } from "../session/session-store.js";
import type { CliContext } from "../types/cli-context.type.js";

export function registerLogin(program: Command, ctx: CliContext) {
  program
    .command("login")
    .description(
      "Sign in with your email and password (or a CLI token from account settings); the session is stored for later commands",
    )
    .requiredOption("--url <url>", "Intentlock server URL")
    .requiredOption("--email <email>")
    .option(
      "--token [token]",
      "sign in with a CLI token instead of a password (prompted when no value)",
    )
    .action(async (opts: { url: string; email: string; token?: string | true }) => {
      const credentials =
        opts.token === undefined
          ? { password: await ctx.prompt("Password: ", { secret: true }) }
          : {
              token:
                opts.token === true
                  ? await ctx.prompt("CLI token: ", { secret: true })
                  : opts.token,
            };
      const url = opts.url.replace(/\/+$/, "");
      const res = await send(ctx, url + API_ENDPOINTS.AUTH_LOGIN, {
        method: HttpMethod.POST,
        headers: { "content-type": "application/json", [CSRF_HEADER]: "1" },
        body: JSON.stringify({ email: opts.email, ...credentials }),
      });
      const { user } = await readResponse<{ user: { email: string; role: string } }>(res);
      const cookie = res.headers
        .getSetCookie()
        .map((c) => c.split(";")[0] ?? "")
        .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
      if (!cookie) throw new CliError("The server did not return a session cookie");
      await saveSession(ctx.home, { url, email: user.email, cookie });
      ctx.print(`Signed in as ${user.email} (${user.role})`);
    });
}
