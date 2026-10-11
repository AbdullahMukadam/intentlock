import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/configure-app.js";

describe("app", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(mod.createNestApplication());
    await app.init();
  });

  afterAll(() => app.close());

  it("boots and answers unknown routes with a JSON 404", async () => {
    const res = await request(app.getHttpServer()).get("/nope").expect(404);
    expect(res.body).toMatchObject({ statusCode: 404 });
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js/);
  });
});
