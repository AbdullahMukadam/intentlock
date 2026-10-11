import { type INestApplication, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants.js";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { AUTH_KIND, type AuthKind } from "../src/common/auth.decorators.js";
import { configureApp } from "../src/configure-app.js";
import { CSRF } from "./helpers.js";

// The only routes anyone may call without signing in (ARCHITECTURE §5.6). Adding one is a
// deliberate security decision: update this list in the same change.
const PUBLIC = ["POST /v1/auth/login"];
const AGENT: string[] = [];

type Route = { method: string; path: string; kind: AuthKind | "session" };

function listRoutes(app: INestApplication): Route[] {
  const reflector = app.get(Reflector);
  const scanner = app.get(MetadataScanner);
  const routes: Route[] = [];
  for (const { metatype, instance } of app.get(DiscoveryService).getControllers()) {
    if (!metatype || !instance) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? "");
    const proto = Object.getPrototypeOf(instance) as Record<string, () => unknown>;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = proto[name]!;
      const path: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      if (path === undefined) continue;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
      const full = `/${[base, String(path)].filter((p) => p && p !== "/").join("/")}`;
      const kind = reflector.getAllAndOverride<AuthKind | undefined>(AUTH_KIND, [
        handler,
        metatype,
      ]);
      routes.push({ method, path: full, kind: kind ?? "session" });
    }
  }
  return routes;
}

describe("route protection", () => {
  let app: INestApplication;
  let routes: Route[];

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = configureApp(mod.createNestApplication());
    await app.init();
    routes = listRoutes(app);
  });

  afterAll(() => app.close());

  const key = (r: Route) => `${r.method} ${r.path}`;

  it("finds the routes", () => {
    expect(routes.map(key)).toContain("GET /v1/me");
  });

  it("opens only the expected public routes", () => {
    expect(
      routes
        .filter((r) => r.kind === "public")
        .map(key)
        .sort(),
    ).toEqual([...PUBLIC].sort());
  });

  it("marks only the expected routes as API-key routes", () => {
    expect(
      routes
        .filter((r) => r.kind === "agent")
        .map(key)
        .sort(),
    ).toEqual([...AGENT].sort());
  });

  it("returns 401 for every non-public route without credentials", async () => {
    for (const r of routes.filter((x) => x.kind !== "public")) {
      const url = r.path.replace(/:(\w+)/g, "x");
      const res = await request(app.getHttpServer())
        [r.method.toLowerCase() as "get"](url)
        .set(CSRF);
      expect({ route: key(r), status: res.status }).toEqual({ route: key(r), status: 401 });
    }
  });
});
