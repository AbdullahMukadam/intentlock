import { EMAIL_SCENARIOS } from "./email/index.js";
import { FILES_SCENARIOS } from "./files/index.js";
import { GITHUB_SCENARIOS } from "./github/index.js";

export const SCENARIOS = [...GITHUB_SCENARIOS, ...EMAIL_SCENARIOS, ...FILES_SCENARIOS];
