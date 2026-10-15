import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { API_ENDPOINTS, STARTER_POLICY } from "@intentlock/core";
import { describe, expect, test } from "vitest";

import { run } from "../../../src/program.js";
import { fakeContext } from "../../../src/testing/fake-context.js";

const AGENTS = [
  {
    id: "ag1",
    name: "github-assistant",
    policyVersion: 3,
    activeKeys: 1,
    disabledAt: null,
    last24h: { allow: 4, block: 1, hold: 0 },
  },
];

function loginRoute() {
  return {
    [`POST ${API_ENDPOINTS.AUTH_LOGIN}`]: () =>
      new Response(JSON.stringify({ user: { email: "admin@acme.dev", role: "admin" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "il_session=abc123; Path=/; HttpOnly; SameSite=Lax",
        },
      }),
  };
}

async function signedIn(routes: Parameters<typeof fakeContext>[0] = {}) {
  const fake = await fakeContext({ ...loginRoute(), ...routes });
  expect(
    await run(["login", "--url", "http://il.test/", "--email", "admin@acme.dev"], fake.ctx),
  ).toBe(0);
  return fake;
}

describe("login", () => {
  test("prompts for the password, sends the CSRF header and stores the session", async () => {
    const { lines, requests, prompts } = await signedIn();
    expect(prompts).toEqual(["Password: "]);
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/auth/login",
      headers: { "x-intentlock-csrf": "1" },
      body: { email: "admin@acme.dev", password: "prompted-secret" },
    });
    expect(requests[0]!.body).not.toHaveProperty("token");
    expect(lines.at(-1)).toBe("Signed in as admin@acme.dev (admin)");
  });

  test("signs in with a CLI token, given or prompted", async () => {
    for (const [args, token] of [
      [["--token", "cli-tok"], "cli-tok"],
      [["--token"], "prompted-secret"],
    ] as const) {
      const fake = await fakeContext(loginRoute());
      const argv = ["login", "--url", "http://il.test", "--email", "admin@acme.dev", ...args];
      expect(await run(argv, fake.ctx)).toBe(0);
      expect(fake.requests[0]!.body).toEqual({ email: "admin@acme.dev", token });
    }
  });

  test("API commands refuse to run without a session", async () => {
    const { ctx, lines } = await fakeContext();
    expect(await run(["users", "list"], ctx)).toBe(1);
    expect(lines.at(-1)).toMatch(/Not signed in/);
  });
});

describe("users", () => {
  test("invite sends role and groups with the stored cookie and prints the link once", async () => {
    const fake = await signedIn({
      [`POST ${API_ENDPOINTS.INVITES}`]: (body) =>
        Response.json(
          {
            invite: { email: (body as { email: string }).email, role: "approver" },
            link: "http://il.test/invite/abc",
            emailed: false,
          },
          { status: 201 },
        ),
    });
    expect(
      await run(
        ["users", "invite", "bob@acme.dev", "--role", "approver", "--groups", "oncall, intern"],
        fake.ctx,
      ),
    ).toBe(0);
    expect(fake.requests.at(-1)).toMatchObject({
      method: "POST",
      path: "/v1/invites",
      headers: { cookie: "il_session=abc123", "x-intentlock-csrf": "1" },
      body: { email: "bob@acme.dev", role: "approver", groups: ["oncall", "intern"] },
    });
    expect(fake.lines.slice(-2)).toEqual([
      "Invite link (shown once): http://il.test/invite/abc",
      "Not emailed (SMTP is not configured or failed); send the link yourself.",
    ]);
  });

  test("reset-link posts to the url-encoded email and prints the link", async () => {
    const fake = await signedIn({
      [`POST /v1/users/bob%40acme.dev/reset-link`]: () =>
        Response.json({ link: "http://il.test/reset/xyz", emailed: true }, { status: 201 }),
    });
    expect(await run(["users", "reset-link", "bob@acme.dev"], fake.ctx)).toBe(0);
    expect(fake.lines.slice(-2)).toEqual([
      "Reset link for bob@acme.dev (shown once): http://il.test/reset/xyz",
      "Also emailed.",
    ]);
  });

  test("list shows each person's sign-in methods", async () => {
    const fake = await signedIn({
      [`GET ${API_ENDPOINTS.USERS}`]: () =>
        Response.json([
          {
            email: "a@acme.dev",
            role: "admin",
            groups: [],
            hasPassword: true,
            providers: ["github"],
            disabledAt: null,
          },
          {
            email: "b@acme.dev",
            role: "member",
            groups: [],
            hasPassword: false,
            providers: [],
            disabledAt: null,
          },
        ]),
    });
    expect(await run(["users", "list"], fake.ctx)).toBe(0);
    expect(fake.lines.at(-2)).toMatch(/a@acme\.dev\s+admin\s+-\s+password,github\s+active/);
    expect(fake.lines.at(-1)).toMatch(/b@acme\.dev\s+member\s+-\s+-\s+active/);
  });

  test("rejects an unknown role before calling the server", async () => {
    const fake = await signedIn();
    expect(await run(["users", "invite", "x@acme.dev", "--role", "owner"], fake.ctx)).not.toBe(0);
    expect(fake.requests).toHaveLength(1);
  });

  test("disable patches the url-encoded email", async () => {
    const fake = await signedIn({ [`PATCH /v1/users/bob%40acme.dev`]: () => Response.json({}) });
    expect(await run(["users", "disable", "bob@acme.dev"], fake.ctx)).toBe(0);
    expect(fake.requests.at(-1)).toMatchObject({ method: "PATCH", body: { disabled: true } });
  });
});

describe("agents and keys", () => {
  test("resolve agents by name and print a new key once", async () => {
    const fake = await signedIn({
      [`GET ${API_ENDPOINTS.AGENTS}`]: () => Response.json(AGENTS),
      [`POST /v1/agents/ag1/api-keys`]: () =>
        Response.json({ id: "k1", prefix: "il_live_abcd", key: "il_live_secret" }, { status: 201 }),
    });
    expect(
      await run(
        ["keys", "create", "--agent", "github-assistant", "--name", "production"],
        fake.ctx,
      ),
    ).toBe(0);
    expect(fake.lines).toContain("INTENTLOCK_API_KEY=il_live_secret");
    expect(await run(["agents", "list"], fake.ctx)).toBe(0);
    expect(fake.lines.some((l) => l.startsWith("github-assistant") && l.includes("4/1/0"))).toBe(
      true,
    );
    expect(await run(["agents", "disable", "nope"], fake.ctx)).toBe(1);
    expect(fake.lines.at(-1)).toBe('error: No agent named "nope"');
  });
});

describe("policy", () => {
  test("push publishes against the active version and surfaces a 409", async () => {
    let active = 3;
    const fake = await signedIn({
      [`GET ${API_ENDPOINTS.AGENTS}`]: () => Response.json(AGENTS),
      [`GET /v1/agents/ag1/policy`]: () =>
        Response.json({ active: { version: active, source: STARTER_POLICY, message: "m" } }),
      [`POST /v1/agents/ag1/policy/publish`]: (body) =>
        (body as { baseVersion: number }).baseVersion === active
          ? Response.json({ version: active + 1 }, { status: 201 })
          : Response.json({ error: "stale_base_version" }, { status: 409 }),
    });
    await writeFile(join(fake.dir, "p.yaml"), STARTER_POLICY);
    expect(
      await run(
        ["policy", "push", "--agent", "github-assistant", "-m", "tighten", "p.yaml"],
        fake.ctx,
      ),
    ).toBe(0);
    expect(fake.requests.at(-1)?.body).toEqual({
      source: STARTER_POLICY,
      baseVersion: 3,
      message: "tighten",
    });
    expect(fake.lines.at(-1)).toBe("Published github-assistant v4 (was v3)");

    active = 5;
    fake.requests.length = 0;
    const realFetch = fake.ctx.fetch;
    fake.ctx.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/publish"))
        return Response.json({ error: "stale_base_version" }, { status: 409 });
      return realFetch(input, init);
    }) as typeof fetch;
    expect(
      await run(
        ["policy", "push", "--agent", "github-assistant", "-m", "again", "p.yaml"],
        fake.ctx,
      ),
    ).toBe(1);
    expect(fake.lines.at(-1)).toBe("error: Server answered 409: stale_base_version");
  });

  test("push refuses an invalid file without calling the server", async () => {
    const fake = await signedIn();
    await writeFile(join(fake.dir, "bad.yaml"), "version: 2\n");
    expect(
      await run(["policy", "push", "--agent", "github-assistant", "-m", "x", "bad.yaml"], fake.ctx),
    ).toBe(1);
    expect(fake.requests).toHaveLength(1);
  });

  test("test prints each call under the active policy and the file, and the changes", async () => {
    const fake = await signedIn({
      [`GET ${API_ENDPOINTS.AGENTS}`]: () => Response.json(AGENTS),
      [`POST /v1/agents/ag1/policy/test`]: () =>
        Response.json({
          results: [
            {
              call: { tool: "github_post_comment" },
              from: { verdict: "allow", ruleId: "allow-in-plan" },
              to: { verdict: "hold", ruleId: "hold-comments" },
            },
          ],
          changed: [{ from: "allow", to: "hold", count: 1 }],
        }),
    });
    await writeFile(join(fake.dir, "p.yaml"), STARTER_POLICY);
    expect(
      await run(
        ["policy", "test", "--agent", "github-assistant", "--replay", "20", "p.yaml"],
        fake.ctx,
      ),
    ).toBe(0);
    expect(fake.requests.at(-1)?.body).toMatchObject({ replayLast: 20, calls: [] });
    expect(fake.lines.at(-1)).toBe("1 call(s) allow → hold");
  });

  test("pull writes the active source to a file", async () => {
    const fake = await signedIn({
      [`GET ${API_ENDPOINTS.AGENTS}`]: () => Response.json(AGENTS),
      [`GET /v1/agents/ag1/policy`]: () =>
        Response.json({ active: { version: 3, source: STARTER_POLICY, message: "m" } }),
    });
    expect(
      await run(
        ["policy", "pull", "--agent", "github-assistant", "--out", "pulled.yaml"],
        fake.ctx,
      ),
    ).toBe(0);
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(join(fake.dir, "pulled.yaml"), "utf8")).toBe(STARTER_POLICY);
  });
});
