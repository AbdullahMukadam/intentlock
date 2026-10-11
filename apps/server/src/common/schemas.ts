import { z } from "zod";

/** Emails are stored and compared lowercased. */
export const Email = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
