import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { SESSION_DIR, SESSION_FILE } from "../constants/cli.constants.js";
import { CliError } from "../errors.js";

export const Session = z.object({ url: z.string().url(), email: z.string(), cookie: z.string() });
export type Session = z.infer<typeof Session>;

export async function saveSession(home: string, session: Session): Promise<void> {
  const dir = join(home, SESSION_DIR);
  await mkdir(dir, { recursive: true });
  const file = join(dir, SESSION_FILE);
  await writeFile(file, JSON.stringify(session, null, 2), { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function loadSession(home: string): Promise<Session> {
  let raw: string;
  try {
    raw = await readFile(join(home, SESSION_DIR, SESSION_FILE), "utf8");
  } catch {
    throw new CliError("Not signed in. Run `intentlock login --url <url> --email <email>` first.");
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    json = undefined;
  }
  const parsed = Session.safeParse(json);
  if (!parsed.success) throw new CliError("Stored session is corrupt; sign in again.");
  return parsed.data;
}
