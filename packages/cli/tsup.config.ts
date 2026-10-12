import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts", compilerOptions: { ignoreDeprecations: "6.0" } },
  clean: true,
  target: "node22",
});
