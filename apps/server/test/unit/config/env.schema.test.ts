import { loadEnv } from "../../../src/config/env.schema.js";

describe("loadEnv", () => {
  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("applies defaults", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://x@localhost/db", SIGNING_KEY: "" });
    expect(env).toMatchObject({ PORT: 3000, INTENTLOCK_DEMO: false, SIGNING_KEY: undefined });
  });
});
