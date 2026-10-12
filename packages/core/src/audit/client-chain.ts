import { jcs, sha256Base64url } from "../canonical.js";
import { ClientEntryBody, type ClientEntry } from "../schemas/audit.js";
import { GENESIS } from "./hash-entry.js";

export type NewClientEntry = Omit<ClientEntryBody, "clientSeq" | "prevLocalHash">;

export async function hashClientEntry(body: ClientEntryBody): Promise<string> {
  const parsed = ClientEntryBody.parse(body);
  return sha256Base64url(`${parsed.prevLocalHash}|${jcs(parsed)}`);
}

export async function chainClientEntry(
  prev: Pick<ClientEntry, "clientSeq" | "localHash"> | null,
  entry: NewClientEntry,
): Promise<ClientEntry> {
  const body: ClientEntryBody = {
    ...entry,
    clientSeq: (prev?.clientSeq ?? 0) + 1,
    prevLocalHash: prev?.localHash ?? GENESIS,
  };
  return { ...body, localHash: await hashClientEntry(body) };
}
