import { z } from "zod";

export const Password = z.string().min(12).max(200);
export const LinkToken = z.string().min(20).max(200);
