import { describe, expect, test } from "vitest";

import { parseProxyArgs, wantsHelp } from "../../src/args.js";

describe("wantsHelp", () => {
  test("sees --help and -h only before the upstream command", () => {
    expect(wantsHelp(["--help"])).toBe(true);
    expect(wantsHelp(["-h", "--", "server"])).toBe(true);
    expect(wantsHelp(["--plan", "p.json", "--", "server", "--help"])).toBe(false);
  });
});

describe("parseProxyArgs", () => {
  test("splits proxy options from the upstream command", () => {
    expect(
      parseProxyArgs([
        "--plan",
        "p.json",
        "--user",
        "sam@acme.dev",
        "--",
        "npx",
        "-y",
        "server",
        "--plan",
        "x",
      ]),
    ).toEqual({
      plan: "p.json",
      user: "sam@acme.dev",
      listTools: false,
      command: "npx",
      commandArgs: ["-y", "server", "--plan", "x"],
    });
  });

  test("allows --list-tools without a plan", () => {
    expect(parseProxyArgs(["--list-tools", "--", "server"])).toMatchObject({
      listTools: true,
      command: "server",
    });
  });

  test("requires an upstream command and a plan", () => {
    expect(() => parseProxyArgs(["--plan", "p.json"])).toThrow(/Missing upstream command/);
    expect(() => parseProxyArgs(["--plan", "p.json", "--"])).toThrow(/Missing upstream command/);
    expect(() => parseProxyArgs(["--", "server"])).toThrow(/Missing --plan/);
    expect(() => parseProxyArgs(["--nope", "--", "server"])).toThrow();
  });
});
