---
title: Policies and versions
description: One YAML policy per agent, versioned on the server and snapshotted into every plan.
sidebar:
  order: 2
---

Each agent has one policy: a YAML document with an ordered list of rules. The plan says what this request may do; the policy says what this agent may ever do, for whom, and what needs a person to approve it. A call has to pass both.

```yaml title="policy.yaml"
version: 1
default: block
rules:
  - id: only-public-repo
    match: { tool: "github_*", args: { repo: { notGlob: "acme/public-app" } } }
    decision: block
    reason: Only acme/public-app is in scope

  - id: hold-comments
    match: { tool: github_post_comment }
    decision: hold
    approvers: { roles: [approver, admin] }

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

Rules are evaluated in order and the first match wins. When no rule matches, the default applies, and the default is always `block`. Every field is described in the [policy reference](/docs/reference/policy/).

## Where policies live

Policies are stored on the server, never in files next to it. You edit them in the inbox (**Agents → your agent → Policy**) with live validation, a dry run against sample calls or recent decisions, and a diff against the active version. Or keep them in Git and use the CLI:

```bash
intentlock policy validate policy.yaml
intentlock policy pull --agent github-assistant --out policy.yaml
intentlock policy test --agent github-assistant policy.yaml --replay 50
intentlock policy push --agent github-assistant policy.yaml -m "hold comments"
```

A new agent starts with the starter policy:

```yaml title="policy.yaml"
version: 1
default: block
rules:
  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

## Versions are immutable

- **Publishing** creates version N+1. It fails with 409 if someone else published since you started editing, so changes are never lost silently.
- **Rollback** creates a new version that copies an old one. History is never rewritten.
- Versions are never edited or deleted. Publishing and rollback are admin-only and audited.

## When a change takes effect

Signing a plan snapshots the agent's active policy into the token. New plans use a new version immediately. Running plans keep the version they were signed with until their token is refreshed, at most one token lifetime (5 to 15 minutes). Every decision records the policy version and hash it was made with.
