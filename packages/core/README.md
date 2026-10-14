# @intentlock/core

The pure engine behind [Intentlock](https://github.com/AbdullahMukadam/intentgate): plan and policy schemas, RFC 8785 canonicalization and plan hashing, Ed25519 bundle signing and verification, the plan matcher, the policy evaluator, `check()` / `decide()`, and audit chain hashing and verification.

No I/O: no network, no database, no clock reads except through an injected `now()`. The server, the SDK gates, the CLI and the evals all share it.

```bash
pnpm add @intentlock/core
```

```ts
import { parsePolicy } from "@intentlock/core";

const parsed = parsePolicy(yamlText);
if (!parsed.ok)
  for (const e of parsed.errors) console.log(`${e.line}:${e.col} ${e.path} ${e.message}`);
```

Most apps do not use this package directly: use [`@intentlock/guard`](https://www.npmjs.com/package/@intentlock/guard) and [`@intentlock/sdk`](https://www.npmjs.com/package/@intentlock/sdk). Formats and the decision algorithm: [ARCHITECTURE.md](https://github.com/AbdullahMukadam/intentgate/blob/main/docs/ARCHITECTURE.md) §3–4.

License: MIT.
