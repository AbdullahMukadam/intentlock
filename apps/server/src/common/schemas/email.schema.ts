import { z } from "zod";

export const Email = z
  .string()
  .trim()
  .email()
  .transform((e) => e.toLowerCase());
