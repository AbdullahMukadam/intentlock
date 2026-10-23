import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, passthroughImageService } from "astro/config";

import { codeFrame } from "./src/lib/code-frame";
import { FAVICON_LINKS } from "./src/lib/favicons";

export default defineConfig({
  site: process.env.SITE_URL,
  output: "static",
  image: { service: passthroughImageService() },
  markdown: { shikiConfig: { theme: "css-variables", wrap: true, transformers: [codeFrame] } },
  env: {
    schema: {
      INBOX_URL: envField.string({
        context: "server",
        access: "public",
        default: "http://localhost:3001",
        url: true,
      }),
    },
  },
  integrations: [
    starlight({
      title: "Intentlock",
      description: "Intent-based authorization for LLM agents.",
      customCss: ["./src/styles/starlight.css"],
      favicon: "/favicon.ico",
      head: FAVICON_LINKS.filter((attrs) => attrs.href !== "/favicon.ico").map((attrs) => ({
        tag: "link" as const,
        attrs,
      })),
      expressiveCode: false,
      components: {
        Header: "./src/components/docs/header.astro",
        Sidebar: "./src/components/docs/sidebar.astro",
        PageTitle: "./src/components/docs/page-title.astro",
      },
      sidebar: [
        {
          label: "Get started",
          items: [
            { slug: "docs", label: "Introduction" },
            "docs/quick-start",
            "docs/protect-your-agent",
            { slug: "docs/sdk/mcp-proxy", label: "Protect an MCP server" },
          ],
        },
        {
          label: "How it works",
          items: [
            "docs/concepts/plans-and-tokens",
            "docs/concepts/policies-and-versions",
            "docs/concepts/verdicts",
            "docs/concepts/holds",
            "docs/concepts/audit-chain",
            { slug: "docs/concepts/gates", label: "Hybrid vs remote" },
          ],
        },
        {
          label: "SDK",
          items: [
            { slug: "docs/sdk/installation", label: "Install" },
            "docs/sdk/guard",
            { slug: "docs/sdk/pausable-holds", label: "Pause on a hold" },
            "docs/sdk/providers",
            { slug: "docs/sdk/gates", label: "Configure a gate" },
            { slug: "docs/sdk/core", label: "Core utilities" },
            "docs/sdk/testing",
          ],
        },
        {
          label: "Reference",
          items: [
            { slug: "docs/reference/policy", label: "Policy rules" },
            "docs/reference/policy-templates",
            "docs/reference/cli",
            "docs/reference/http-api",
          ],
        },
        {
          label: "Self-hosting",
          items: [
            { slug: "docs/deployment/self-host", label: "Run on your server" },
            "docs/deployment/free-hosting",
            "docs/deployment/environment-variables",
          ],
        },
        { label: "Project", items: ["docs/security", "docs/licensing"] },
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
