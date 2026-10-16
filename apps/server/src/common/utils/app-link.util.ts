import type { Env } from "../../config/env.schema.js";
import type { AppPage } from "../enums/app-page.enum.js";

export function appLink(env: Pick<Env, "PUBLIC_URL">, page: AppPage, token: string): string {
  return `${env.PUBLIC_URL}${page}/${token}`;
}
