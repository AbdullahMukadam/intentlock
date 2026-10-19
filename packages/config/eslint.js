// Shared ESLint flat config. Import boundaries follow docs/STRUCTURE.md §4.
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

const PROVIDER_SDKS = ["openai", "openai/*", "@anthropic-ai/*"];
const NODE_IO = [
  "node:*",
  "fs",
  "fs/*",
  "http",
  "https",
  "net",
  "child_process",
  "@prisma/*",
  "pg",
];
const APPS = ["@intentlock/server", "@intentlock/inbox", "@intentlock/demo", "@intentlock/site"];
const ELV2_PACKAGES = ["@intentlock/cli", "@intentlock/evals", "@intentlock/mcp-proxy"];

// What each workspace package may NOT import. Arrows in STRUCTURE §4 point at what is allowed.
const BANNED = {
  core: ["@intentlock/*", ...NODE_IO, ...PROVIDER_SDKS],
  sdk: ["@intentlock/guard", "@intentlock/anthropic", ...ELV2_PACKAGES, ...APPS, ...PROVIDER_SDKS],
  guard: ["@intentlock/anthropic", ...ELV2_PACKAGES, ...APPS, ...PROVIDER_SDKS],
  anthropic: [...ELV2_PACKAGES, ...APPS, "openai", "openai/*"],
  cli: [
    "@intentlock/sdk",
    "@intentlock/guard",
    "@intentlock/anthropic",
    "@intentlock/evals",
    ...APPS,
  ],
  evals: ["@intentlock/cli", ...APPS, ...PROVIDER_SDKS],
  "mcp-proxy": [
    "@intentlock/guard",
    "@intentlock/anthropic",
    "@intentlock/cli",
    "@intentlock/evals",
    ...APPS,
    ...PROVIDER_SDKS,
  ],
  server: [
    "@intentlock/sdk",
    "@intentlock/guard",
    "@intentlock/anthropic",
    ...ELV2_PACKAGES,
    ...APPS,
    ...PROVIDER_SDKS,
  ],
  inbox: [
    "@intentlock/sdk",
    "@intentlock/guard",
    "@intentlock/anthropic",
    ...ELV2_PACKAGES,
    ...APPS,
    ...PROVIDER_SDKS,
  ],
  demo: ["@intentlock/cli", "@intentlock/evals", ...APPS],
  site: [...ELV2_PACKAGES, ...APPS, ...PROVIDER_SDKS],
};

// Boundaries apply to shipped code and tests, not to config files like eslint.config.js.
const SOURCE = ["src/**", "test/**", "app/**"];
const TYPED = SOURCE.map((dir) => `${dir}/*.{ts,tsx}`);

const DEEP_IMPORT = {
  group: ["@intentlock/*/*", "!@intentlock/ui/*", "!@intentlock/config/*"],
  message: "Import from the package root, e.g. @intentlock/core (STRUCTURE §4).",
};

function restrict(pkg, banned) {
  return [
    "error",
    {
      patterns: [
        DEEP_IMPORT,
        { group: banned, message: `Not allowed in ${pkg}; see docs/STRUCTURE.md §4.` },
      ],
    },
  ];
}

/** @param {keyof typeof BANNED} pkg */
export function intentlock(pkg, ...extra) {
  const banned = BANNED[pkg];
  if (!banned) throw new Error(`Unknown package "${pkg}" in @intentlock/config/eslint`);
  return defineConfig(
    { ignores: ["dist/**", "coverage/**", ".next/**", ".astro/**", "next-env.d.ts"] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
        ],
      },
    },
    { files: SOURCE, rules: { "no-restricted-imports": restrict(pkg, banned) } },
    {
      files: TYPED,
      languageOptions: { parserOptions: { projectService: true } },
      rules: {
        "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: false }],
        "@typescript-eslint/no-misused-promises": "error",
        "@typescript-eslint/only-throw-error": "error",
        "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",
      },
    },
    pkg === "server"
      ? {
          files: ["test/**"],
          rules: {
            "no-restricted-imports": restrict(
              pkg,
              banned.filter((b) => b !== "@intentlock/sdk"),
            ),
          },
        }
      : {},
    // Provider SDKs live only in guard's provider adapters (ARCHITECTURE §7.5 rule 9).
    pkg === "guard"
      ? {
          files: ["src/provider/**", "test/unit/provider/**"],
          rules: {
            "no-restricted-imports": restrict(
              pkg,
              banned.filter((b) => !PROVIDER_SDKS.includes(b)).concat("@anthropic-ai/*"),
            ),
          },
        }
      : {},
    prettier,
    ...extra,
  );
}
