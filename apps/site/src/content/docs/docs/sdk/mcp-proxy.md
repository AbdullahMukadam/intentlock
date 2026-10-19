---
title: MCP proxy
description: Put Intentlock in front of any stdio MCP server, so Claude Desktop, Cursor or Claude Code only use the tools you planned.
sidebar:
  order: 7
---

`intentlock-mcp` sits between an MCP client (Claude Desktop, Cursor, Claude Code) and an MCP server that runs over stdio. The client starts the proxy instead of the server; the proxy starts the server and checks every tool call against a plan and the agent's policy:

- the client only sees the tools named in your plan file;
- every `tools/call` goes through the gate: allowed calls are forwarded, blocked calls return an error result with the reason;
- risky calls wait for an approver in the inbox;
- every decision lands in the audit log.

It runs with `npx`, so there is nothing to install (Node 22 or newer):

```bash
npx -y @intentlock/mcp-proxy --help
```

## 1. Create an agent

One MCP setup is one agent (for example `claude-desktop-github`). Create it and an API key in the inbox under **Agents**, or with the [CLI](/docs/reference/cli/). Its policy is where holds and argument limits go.

## 2. Write the plan file

MCP clients never send a task, so the plan comes from a file you write once: which upstream tools this setup may use, and with which arguments. List the server's tools first:

```bash
npx -y @intentlock/mcp-proxy --list-tools -- npx -y @modelcontextprotocol/server-github
```

Then pick the ones you need:

```json title="github-plan.json"
{
  "goal": "Triage issues in acme/app",
  "steps": [
    { "tool": "list_issues", "args": { "owner": { "eq": "acme" }, "repo": { "eq": "app" } }, "maxCalls": 200 },
    { "tool": "get_issue", "args": { "owner": { "eq": "acme" }, "repo": { "eq": "app" } }, "maxCalls": 200 },
    { "tool": "add_issue_comment", "args": { "owner": { "eq": "acme" }, "repo": { "eq": "app" } }, "maxCalls": 50 }
  ]
}
```

Steps use the format from [Plans and tokens](/docs/concepts/plans-and-tokens/#the-plan), without `version` and `user`. Tool names must match the server's names exactly. At most 50 steps.

## 3. Configure the client

Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json`) and Claude Code (`.mcp.json`) use the same shape. Replace the server's entry with the proxy, and put the original command after `--`:

```json title="claude_desktop_config.json"
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y", "@intentlock/mcp-proxy",
        "--plan", "/home/sam/github-plan.json",
        "--",
        "npx", "-y", "@modelcontextprotocol/server-github"
      ],
      "env": {
        "INTENTLOCK_URL": "https://intentlock.acme.dev/api",
        "INTENTLOCK_API_KEY": "il_live_...",
        "INTENTLOCK_USER": "sam@acme.dev",
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

| Variable | Meaning |
| --- | --- |
| `INTENTLOCK_URL` | Your Intentlock API URL. |
| `INTENTLOCK_API_KEY` | The agent's API key. Never passed to the upstream server. |
| `INTENTLOCK_USER` | The team member the client acts for (or `--user`). Must be an active member. |
| `INTENTLOCK_OUTBOX_DIR` | Where decisions are queued before upload. Default `~/.intentlock/outbox`. |

Every other variable is passed through to the upstream server. The proxy writes its logs to stderr, which most clients show in their MCP log.

## Holds

MCP clients give up on a tool call after about a minute, so the proxy does not wait for an approval. A held call returns at once with a message telling the model to ask you to approve it in the inbox and then make the same call again. When the model repeats exactly the same call (same tool, same arguments):

- **approved:** the call runs once;
- **rejected:** it is blocked, and the model is told not to retry;
- **still pending:** the same message again;
- **expired:** it is checked again, which usually creates a new hold.

An approval only ever runs the call that was approved. A call with different arguments is checked on its own.

## Limits

- **Tools only.** Resources, prompts and sampling from the upstream server are not passed through.
- **Stdio servers only.** Remote (HTTP) MCP servers are not supported yet.
- **The plan is fixed.** The model cannot add tools. Change the file and restart the client to change it.
- **`maxCalls` counts per signed plan.** The proxy refreshes its token while the client is open. After more than an hour idle it signs the plan file again, which starts new counters.
- **It fails closed.** If the Intentlock server cannot be reached, calls are blocked.
