import { INBOX_URL } from "astro:env/server";

export const DOCS_PATH = "/docs/";
export const GITHUB_URL = "https://github.com/AbdullahMukadam/intentgate";
export const SIGN_IN_URL = new URL("/login", INBOX_URL).href;
