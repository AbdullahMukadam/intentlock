---
title: Introduction
description: What Intentlock is and how it checks every tool call an AI agent makes.
---

Intentlock is a self-hosted, intent-based authorization layer for LLM agents. The agent declares a plan before it reads anything untrusted, Intentlock signs it, and every tool call is checked against that plan and your policies: allow, block, or hold for a human. Every decision lands in a tamper-evident audit log.

It is written in TypeScript and runs as one deployment per team.

## Why it exists

An agent with a GitHub token can do anything that token allows. If a malicious issue tells it to copy a private repository into a public pull request, the model may do it: the tools and the token are fine, but nothing checks whether each action matches what the person asked for.

Intentlock fixes the scope per request. The plan is signed before the agent reads the injected text, so anything that text asks for outside the plan is blocked, however convincing it is. Policies add a second, independent layer: which repositories, amounts and recipients are in scope, and which actions need a person to approve them.

## How it works

1. **Declare.** Your agent gets a task for a person on your team, for example `alice@acme.dev`. Before it calls any tool, it declares a plan: the tools it needs, optionally with pinned arguments.
2. **Sign.** The server signs the plan together with the agent's active policy and the person's role and groups. The result is a short-lived token.
3. **Check.** Every tool call is checked against the signed plan, then against the policy rules.
4. **Decide.** `allow` runs the tool. `block` returns an error result to the model with the reason. `hold` waits until someone approves or rejects the call in the inbox.
5. **Audit.** Every decision is appended to a hash chain you can browse in the inbox and verify offline.

If anything goes wrong (the server is down, the token is invalid, the audit write fails), the call is blocked. Tools only run on an explicit `allow`.

## What you get

- **The server** (NestJS and Postgres): signs plans, stores policies and their versions, creates holds, keeps the audit chain.
- **The inbox** (Next.js): approve holds, edit and test policies, browse runs and audit entries, manage the team and agents.
- **The SDK packages** (MIT): a provider-agnostic agent guard and gates you embed in your own app.
- **The MCP proxy** (`intentlock-mcp`): put Intentlock in front of any stdio MCP server used by Claude Desktop, Cursor or Claude Code, with no code.
- **The `intentlock` CLI**: manage users, agents, keys and policies, and verify an exported audit chain.

## Where to go next

- [Quick start](/docs/quick-start/): run the server, create the first admin and connect an agent.
- [Plans and tokens](/docs/concepts/plans-and-tokens/): the model behind every decision.
- [Agent guard](/docs/sdk/guard/): wire Intentlock into your agent's tool loop.
- [MCP proxy](/docs/sdk/mcp-proxy/): protect Claude Desktop, Cursor or Claude Code with a plan file, no code.
- [Policy reference](/docs/reference/policy/): every rule and match field.
