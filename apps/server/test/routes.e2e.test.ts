import { type INestApplication, RequestMethod } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants.js";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum.js";
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { AUTH_KIND_KEY } from "../src/common/constants/auth.constants.js";
import type { AuthKind } from "../src/common/types/auth.types.js";
import { hasSchema } from "../src/common/utils/zod-dto.util.js";
import { configureApp } from "../src/configure-app.js";
import { CSRF } from "./helpers.js";

// The only routes anyone may call without signing in (ARCHITECTURE §5.6). Adding one is a
// deliberate security decision: update this list in the same change.
const PUBLIC = ["POST /v1/auth/login"];
const AGENT: string[] = [];

type Route = {
  method: string;
  path: string;
  kind: AuthKind | "session";
  /** @Body/@Query/@Param arguments not typed with a zodDto class */
  unvalidated: string[];
};

const VALIDATED = new Map([
  [RouteParamtypes.BODY, "body"],
  [RouteParamtypes.QUERY, "query"],
  [RouteParamtypes.PARAM, "param"],
]);

function unvalidatedArgs(controller: object, proto: object, name: string): string[] {
  const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}) as Record<
    string,
    { index: number }
  >;
  const types = (Reflect.getMetadata("design:paramtypes", proto, name) ?? []) as unknown[];
  return Object.entries(args)
    .map(([k, { index }]) => ({ kind: VALIDATED.get(Number(k.split(":")[0])), index }))
    .filter(({ kind, index }) => kind && !hasSchema(types[index]))
    .map(({ kind, index }) => `@${kind}() #${index}`);
}

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
      const kind = reflector.getAllAndOverride<AuthKind | undefined>(AUTH_KIND_KEY, [
        handler,
        metatype,
      ]);
      routes.push({
        method,
        path: full,
        kind: kind ?? "session",
        unvalidated: unvalidatedArgs(metatype, proto, name),
      });
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

  it("validates every body, query and route parameter with a zod schema", () => {
    expect(
      routes
        .filter((r) => r.unvalidated.length)
        .map((r) => `${key(r)}: ${r.unvalidated.join(", ")}`),
    ).toEqual([]);
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
