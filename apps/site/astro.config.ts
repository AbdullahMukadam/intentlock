import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, passthroughImageService } from "astro/config";

import { codeFrame } from "./src/lib/code-frame";
import { FAVICON_LINKS } from "./src/lib/favicons";

const group = (label: string, directory: string) => ({
  label,
  collapsed: true,
  items: [{ autogenerate: { directory: `docs/${directory}` } }],
});

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
        { label: "Start here", collapsed: true, items: ["docs", "docs/quick-start"] },
        group("Concepts", "concepts"),
        group("SDK guide", "sdk"),
        group("Reference", "reference"),
        group("Deployment", "deployment"),
        { label: "Project", collapsed: true, items: ["docs/security", "docs/licensing"] },
      ],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
