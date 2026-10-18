import { z } from "zod";

export function docsUrl(value: string | undefined): string | null {
  const parsed = z.url({ protocol: /^https?$/ }).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const DOCS_URL = docsUrl(process.env.NEXT_PUBLIC_DOCS_URL);
