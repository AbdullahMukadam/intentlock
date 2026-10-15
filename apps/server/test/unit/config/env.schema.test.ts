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
    });
  });

  it("parses TRUST_PROXY as a hop count", () => {
    const base = { DATABASE_URL: "postgresql://x@localhost/db" };
    expect(loadEnv({ ...base, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(() => loadEnv({ ...base, TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
  });
});
