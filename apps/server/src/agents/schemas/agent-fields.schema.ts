import { z } from "zod";

export const AgentNameSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Agent names are kebab-case, e.g. github-assistant");
export const AgentDescriptionSchema = z.string().max(500);
export const AgentIdSchema = z.string().min(1).max(64);
