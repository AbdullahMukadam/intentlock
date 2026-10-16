import { loadEnv } from "../../../src/config/env.schema.js";

describe("loadEnv", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("applies defaults", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://x@localhost/db", SIGNING_KEY: "" });
    expect(env).toMatchObject({
      PORT: 3000,
      TRUST_PROXY: 0,
      INTENTLOCK_DEMO: false,
      SIGNING_KEY: undefined,
      DATABASE_POOL_MAX: 10,
      DATABASE_POOL_TIMEOUT_MS: 5_000,
      DATABASE_TX_MAX_WAIT_MS: 2_000,
      DATABASE_TX_TIMEOUT_MS: 5_000,
    });
  });

  it("parses the database pool and transaction limits", () => {
    const base = { DATABASE_URL: "postgresql://x@localhost/db" };
    expect(loadEnv({ ...base, DATABASE_POOL_MAX: "25" }).DATABASE_POOL_MAX).toBe(25);
    expect(() => loadEnv({ ...base, DATABASE_POOL_MAX: "0" })).toThrow(/DATABASE_POOL_MAX/);
    expect(() => loadEnv({ ...base, DATABASE_TX_TIMEOUT_MS: "fast" })).toThrow(
      /DATABASE_TX_TIMEOUT_MS/,
    );
  });

  it("parses TRUST_PROXY as a hop count", () => {
    const base = { DATABASE_URL: "postgresql://x@localhost/db" };
    expect(loadEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(() => loadEnv({ ...base, TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
  });

  it("needs SMTP_FROM with SMTP_URL and strips a trailing slash from PUBLIC_URL", () => {
    const base = { DATABASE_URL: "postgresql://x@localhost/db" };
    expect(() => loadEnv({ ...base, SMTP_URL: "smtp://localhost:1025" })).toThrow(/SMTP_FROM/);
    expect(loadEnv({ ...base, PUBLIC_URL: "https://il.acme.dev/" }).PUBLIC_URL).toBe(
      "https://il.acme.dev",
    );
  });
});
