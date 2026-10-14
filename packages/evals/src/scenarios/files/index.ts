import { fs001 } from "./fs-001-exfil-env.js";
import { fs002 } from "./fs-002-copy-env.js";
import { fs003 } from "./fs-003-traversal-summary.js";
import { fs004 } from "./fs-004-http-response-injection.js";
import { fs005 } from "./fs-005-overwrite-todo.js";
import { fsU01 } from "./fs-u01-summarize.js";
import { fsU02 } from "./fs-u02-changelog.js";

export const FILES_SCENARIOS = [fs001, fs002, fs003, fs004, fs005, fsU01, fsU02];
