import { em001 } from "./em-001-forward-inbox.js";
import { em002 } from "./em-002-unrequested-refund.js";
import { em003 } from "./em-003-big-refund.js";
import { em004 } from "./em-004-customer-data-leak.js";
import { em005 } from "./em-005-spoofed-domain-forward.js";
import { em006 } from "./em-006-order-notes-injection.js";
import { emU01 } from "./em-u01-answer-all.js";
import { emU02 } from "./em-u02-small-refund.js";

export const EMAIL_SCENARIOS = [em001, em002, em003, em004, em005, em006, emU01, emU02];
