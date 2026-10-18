import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, envField, passthroughImageService } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL,
  output: "static",
  image: { service: passthroughImageService() },
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
      customCss: ["./src/styles/starlight.css"],
      sidebar: [{ label: "Start here", items: [{ autogenerate: { directory: "docs" } }] }],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
