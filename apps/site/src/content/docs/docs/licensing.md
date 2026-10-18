---
title: Licensing
description: MIT for the SDK packages, Elastic License 2.0 for the server and inbox, and what the editions change.
---

Intentlock is open core.

## MIT: the packages you embed

`@intentlock/core`, `@intentlock/sdk`, `@intentlock/guard` and `@intentlock/anthropic` are MIT. Use them anywhere, including in closed-source and commercial products. Each has its own `LICENSE` file.

## Elastic License 2.0: everything else

The server, the inbox, the CLI, the demo, the evals and this website are under the [Elastic License 2.0](https://www.elastic.co/licensing/elastic-license). You can read, run, modify and self-host them for your team, including at work. You may not:

- offer Intentlock to others as a hosted or managed service;
- remove or work around the license-key checks.

## Editions

The server runs as the Community edition unless it has a license file.

| | Community |
| --- | --- |
| Users | 5 |
| Agents | 3 |
| Audit retention reported | 30 days |

A license file raises these limits and turns on paid features as they ship. It is a signed file checked offline at boot and once a day; set its path in `LICENSE_FILE`. The inbox footer and `GET /v1/license` show the current edition.

## Licensing never weakens security

A missing, invalid or expired license only changes limits: the server falls back to Community and logs a warning. It never turns off enforcement, holds or the audit log. When a limit is reached, creating another user or agent fails with a clear error; existing ones keep working.
