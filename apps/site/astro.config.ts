import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, passthroughImageService } from "astro/config";

export default defineConfig({
  site: process.env.SITE_URL,
  output: "static",
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: "Intentlock",
      customCss: ["./src/styles/starlight.css"],
      sidebar: [{ label: "Start here", items: [{ autogenerate: { directory: "docs" } }] }],
    }),
  ],
  vite: { plugins: [tailwindcss()] },
});
