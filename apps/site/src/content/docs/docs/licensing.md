---
title: Licensing
description: MIT for the SDK packages, Elastic License 2.0 for the server and inbox, and what a license changes.
---

Intentlock is open core.

## MIT: the packages you embed

`@intentlock/core`, `@intentlock/sdk`, `@intentlock/guard` and `@intentlock/anthropic` are MIT. Use them anywhere, including in closed-source and commercial products. Each has its own `LICENSE` file.

## Elastic License 2.0: everything else

The server, the inbox, the CLI, the demo, the evals and this website are under the [Elastic License 2.0](https://www.elastic.co/licensing/elastic-license). You can read, run, modify and self-host them for your team, including at work. You may not:

- offer Intentlock to others as a hosted or managed service;
- remove or work around the license-key checks.

## Free and licensed

Every feature is in every install. Without a license file the server runs with the free limits; a license, priced per seat per year, lifts them.

| | Free | Licensed |
| --- | --- | --- |
| Users | 5 | the seats on the license |
| Agents | 3 | unlimited |
| Audit history shown | 30 days | set by the license (365 days by default) |

A license is a signed key, checked offline. An admin pastes it on the **License** page in the inbox; it is verified before it is saved and takes effect at once; if you run several server instances, the others pick it up within an hour. You can also put it in a file and set `LICENSE_FILE`; the file then wins and the inbox page is read-only. The License page shows seats used, agents, retention and the expiry date, and warns when the team is over its limits. The sidebar shows who the install is licensed to.

Audit history shown is how far back Activity, runs, stats and exports reach. Older entries are never deleted because of the license: they stay in the database, the chain verify still covers them, and a license shows them again. Deleting old entries is a separate setting that is off by default (see the environment variables).

## When a license expires

Admins get an email 30, 7 and 1 days before the expiry date (when SMTP is set) and see a banner in the inbox during the last 30 days. After the expiry date the install keeps its limits for 14 more days, then falls back to the free limits; admins get one more email and the change is written to the audit log. Paste a renewed key on the License page at any time.

## Licensing never weakens security

A missing, invalid or expired license only changes limits: the server falls back to the free limits and logs a warning. It never turns off enforcement, holds or the audit log. When a limit is reached, creating another user or agent fails with a clear error; existing ones keep working.
