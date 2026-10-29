# @intentlock/mcp-proxy

`intentlock-mcp` puts [Intentlock](https://github.com/AbdullahMukadam/intentlock) in front of any stdio MCP server. Claude Desktop, Cursor or Claude Code only see the tools in your plan file, every tool call is checked against the plan and your agent's policy, risky calls wait for an approver, and every decision is in the audit log.

```bash
npx -y @intentlock/mcp-proxy --list-tools -- npx -y @modelcontextprotocol/server-github
```

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@intentlock/mcp-proxy",
        "--plan",
        "/home/sam/github-plan.json",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-github"
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

The plan file, holds and limits are explained in the docs: [MCP proxy](https://github.com/AbdullahMukadam/intentlock/blob/main/apps/site/src/content/docs/docs/sdk/mcp-proxy.md).

Needs Node 22 or newer and a running Intentlock server.

## License

Elastic License 2.0 (see `LICENSE`). You may use and run it, including at work; you may not offer it as a managed service. The SDK packages (`@intentlock/core`, `sdk`, `guard`, `anthropic`) are MIT.
