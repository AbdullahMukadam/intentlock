---
title: Policy reference
description: Every field of the policy format, every rule type and every match operator.
sidebar:
  order: 1
---

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
    timeoutSeconds: 300

  - id: interns-read-only
    match: { tool: "github_*", user: { group: intern } }
    except: { tool: [github_list_issues, github_get_issue] }
    decision: block

  - id: allow-in-plan
    match: { inPlan: true }
    decision: allow
```

## Top level

| Field | Value |
| --- | --- |
| `version` | Always `1`. |
| `default` | Always `block`. Applies when no rule matches (`no_matching_rule`). |
| `rules` | An ordered list. The first rule that matches decides. |

Unknown fields are errors, so a typo never silently does nothing.

## Rules

Every rule has:

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Kebab-case (`hold-comments`), unique in the policy. Recorded with every decision it makes. |
| `match` | yes | Which calls the rule applies to. All given fields must match. |
| `except` | no | Same shape as `match`. Calls that match it are excluded from the rule. |
| `decision` | yes | `allow`, `block` or `hold`. |
| `reason` | no | Shown to the model and in the inbox when the rule blocks. |

### allow

```yaml
- id: allow-in-plan
  match: { inPlan: true }
  decision: allow
```

Runs the tool. Policies are checked after the plan, so an `allow` rule can never let an off-plan call through. Keep `allow-in-plan` last: rules after it never apply to calls that are in the plan.

### block

```yaml
- id: no-prs
  match: { tool: [github_create_pull_request, github_merge_pull_request] }
  decision: block
  reason: This agent never opens or merges pull requests
```

Stops the call. The model receives the rule id and `reason` as an error result.

### hold

```yaml
- id: hold-large-refunds
  match: { tool: issue_refund, args: { amount: { gte: 100 } } }
  decision: hold
  approvers: { roles: [admin], emails: [finance@acme.dev] }
  timeoutSeconds: 900
```

Pauses the call until someone approves or rejects it. See [Holds](/docs/concepts/holds/).

| Field | Default | Meaning |
| --- | --- | --- |
| `approvers.roles` | `[]` | Anyone with one of these roles (`admin`, `approver`, `member`). |
| `approvers.emails` | `[]` | These people. |
| `approvers.self` | `false` | The person the agent acts for may approve their own hold. |
| `timeoutSeconds` | `300` | 1 to 86,400. The hold expires after this. |

At least one of `roles`, `emails` or `self: true` is required, so every hold can be approved by someone.

## Match fields

| Field | Matches when |
| --- | --- |
| `tool` | The tool name matches a glob (`"github_*"`) or one of a list of globs. |
| `args` | Every listed argument satisfies its condition. |
| `user.email` | The person's email matches a glob. Case-insensitive. |
| `user.role` | The person has this role. |
| `user.group` | The person is in this group. |
| `inPlan` | The call is (or, with `false`, is not) in the signed plan. |

Roles and groups come from the team on the server and are snapshotted into the token when the plan is signed.

## Argument conditions

| Operator | Matches when the argument |
| --- | --- |
| `eq` | equals the value exactly. |
| `in` | equals one of the values. |
| `notIn` | does not equal any of the values, or is missing. |
| `glob` | is a string matching the glob. |
| `notGlob` | is not a string matching the glob, or is missing. |
| `regex` | is a string the regular expression matches in full. |
| `lte` | is a number less than or equal to the value. |
| `gte` | is a number greater than or equal to the value. |

Details:

- `eq` and `in` compare JSON values exactly, ignoring key order. `"20"` is not equal to `20`.
- `glob`: `*` does not cross `/`, dotfiles are matched, and a leading `!` is a literal character, not a negation.
- `regex` must match the whole string; it is wrapped in `^(?:…)$`.
- Positive operators (`eq`, `in`, `glob`, `regex`, `lte`, `gte`) match only when the argument is present and has the right type.
- `notIn` and `notGlob` are exact negations, so they also match a missing or wrong-typed argument. In a `block` rule that is the safe outcome: `only-public-repo` above also blocks GitHub tools that have no `repo` argument. Keep this in mind if you use them in an `allow` rule.

Plan steps use the positive operators only.

## Checking a policy

```bash
intentlock policy validate policy.yaml
intentlock policy test --agent github-assistant policy.yaml --replay 50
```

`validate` checks the syntax offline. `test` runs a dry run on the server against sample calls or the agent's last decisions, and shows which ones would change. The inbox editor does both as you type.
