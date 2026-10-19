---
title: Policy templates
description: Ready-made policies for GitHub, email, payments, files and outbound HTTP. Copy one, rename the tools and adjust the limits.
---

Each template is a complete policy. Copy it, rename the tools to match yours, change the domains, repositories and amounts, then check and publish it:

```bash
intentlock policy validate policy.yaml
intentlock policy test --agent my-agent policy.yaml --replay 50
intentlock policy push --agent my-agent -m "From the GitHub template" policy.yaml
```

Every template ends with `allow-in-plan`, so calls the signed plan does not cover are always blocked. The rules above it narrow what the plan may do. Combine templates by putting their rules in one file, above a single `allow-in-plan`. Every field is described in the [policy reference](/docs/reference/policy/).

## GitHub

An issue-triage or coding assistant that works on your own repositories. Public writes wait for a person; merges and deletes never happen.

```yaml title="github.yaml"
version: 1
default: block
rules:
  - id: own-repos-only
    match: { tool: "github_*" }
    except: { args: { repo: { glob: "acme/*" } } }
    decision: block
    reason: Only repositories in the acme organization are in scope

  - id: no-merge-or-delete
    match: { tool: [github_merge_pull_request, "github_delete_*"] }
    decision: block
    reason: Merging and deleting are done by people

  - id: hold-public-writes
    match: { tool: [github_post_comment, github_create_issue, github_create_pull_request] }
    decision: hold
    approvers: { roles: [admin, approver] }
    timeoutSeconds: 600
    reason: Anything public is reviewed before it goes out

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

## Email

A support or sales assistant. Mail to colleagues goes out; mail to anyone else waits for a person; forwarding outside the company is blocked.

```yaml title="email.yaml"
version: 1
default: block
rules:
  - id: forward-inside-only
    match: { tool: email_forward }
    except: { args: { to: { glob: "*@acme.dev" } } }
    decision: block
    reason: Mail is only forwarded inside acme.dev

  - id: hold-external-email
    match: { tool: email_send }
    except: { args: { to: { glob: "*@acme.dev" } } }
    decision: hold
    approvers: { roles: [admin, approver], self: true }
    timeoutSeconds: 900
    reason: Email outside acme.dev is reviewed before it is sent

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

`self: true` lets the person the agent acts for approve their own outgoing mail. Remove it if a second person must check.

## Payments and refunds

Small amounts run on their own, mid-size amounts wait for finance, large amounts and other currencies are blocked. Interns never move money.

```yaml title="payments.yaml"
version: 1
default: block
rules:
  - id: interns-no-payments
    match: { tool: [payment_send, refund_issue], user: { group: intern } }
    decision: block
    reason: Interns cannot move money

  - id: supported-currencies
    match: { tool: payment_send }
    except: { args: { currency: { in: [USD, EUR] } } }
    decision: block
    reason: Only USD and EUR payments are supported

  - id: payment-cap
    match: { tool: [payment_send, refund_issue] }
    except: { args: { amount: { lte: 1000 } } }
    decision: block
    reason: Amounts over 1,000 are handled by finance directly

  - id: small-amounts
    match: { tool: [payment_send, refund_issue], args: { amount: { lte: 50 } } }
    decision: allow

  - id: hold-payments
    match: { tool: [payment_send, refund_issue] }
    decision: hold
    approvers: { roles: [admin], emails: [finance@acme.dev] }
    timeoutSeconds: 3600
    reason: Amounts over 50 are approved by finance

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

A missing or non-numeric `amount` never matches `lte`, so `payment-cap` blocks it. Caps apply per call: to bound a whole run, also set `maxCalls` on the plan step (see [Limits to know](/docs/protect-your-agent/#limits-to-know)).

## Files

A coding or documents assistant that stays inside one folder, never touches secrets, and asks before deleting.

```yaml title="files.yaml"
version: 1
default: block
rules:
  - id: no-secrets
    match: { tool: "fs_*", args: { path: { glob: "**/{.env*,*.pem,*.key,id_rsa*}" } } }
    decision: block
    reason: Secret files are never read or written

  - id: workspace-only
    match: { tool: "fs_*" }
    except: { args: { path: { glob: "workspace{,/**}" } } }
    decision: block
    reason: The assistant only works inside the workspace folder

  - id: hold-deletes
    match: { tool: fs_delete }
    decision: hold
    approvers: { roles: [admin, approver], self: true }
    timeoutSeconds: 300
    reason: Deleting files is confirmed by a person

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

Paths are matched as the tool receives them. Make your file tools resolve paths relative to the workspace and refuse `..`, so a path like `workspace/../.env` never reaches the disk.

## Outbound HTTP

Any agent with a generic `http_request` tool. Only listed hosts are reachable, and anything that changes data waits for a person.

```yaml title="http.yaml"
version: 1
default: block
rules:
  - id: allowed-hosts
    match: { tool: http_request }
    except: { args: { url: { glob: "https://{api.acme.dev,hooks.slack.com}/**" } } }
    decision: block
    reason: Only api.acme.dev and hooks.slack.com are reachable

  - id: hold-writes
    match: { tool: http_request }
    except: { args: { method: { in: [GET, HEAD] } } }
    decision: hold
    approvers: { roles: [admin, approver] }
    timeoutSeconds: 600
    reason: Requests that change data are reviewed first

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

A request without a `method` is held, not allowed: `except` only skips the hold for an explicit `GET` or `HEAD`.
