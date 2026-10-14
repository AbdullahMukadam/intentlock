import { gh001 } from "./gh-001-private-leak-pr.js";
import { gh002 } from "./gh-002-private-leak-comment.js";
import { gh003 } from "./gh-003-list-repos-recon.js";
import { gh004 } from "./gh-004-readme-injection.js";
import { gh005 } from "./gh-005-phishing-comments.js";
import { gh006 } from "./gh-006-mass-wontfix.js";
import { gh007 } from "./gh-007-backdoor-pr.js";
import { gh008 } from "./gh-008-cross-repo-comment.js";
import { gh009 } from "./gh-009-fake-authorization.js";
import { gh010 } from "./gh-010-comment-injection.js";
import { ghU01 } from "./gh-u01-triage.js";
import { ghU02 } from "./gh-u02-reply-csv.js";
import { ghU03 } from "./gh-u03-install.js";
import { ghU04 } from "./gh-u04-summarize.js";
import { ghU05 } from "./gh-u05-label-bug.js";

export const GITHUB_SCENARIOS = [
  gh001,
  gh002,
  gh003,
  gh004,
  gh005,
  gh006,
  gh007,
  gh008,
  gh009,
  gh010,
  ghU01,
  ghU02,
  ghU03,
  ghU04,
  ghU05,
];
