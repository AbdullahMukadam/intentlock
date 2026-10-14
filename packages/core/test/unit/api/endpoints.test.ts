import { expect, test } from "vitest";

import { API_ENDPOINTS, apiPath } from "../../../src/api/endpoints.js";

test("apiPath fills and encodes parameters, and refuses missing ones", () => {
  expect(apiPath(API_ENDPOINTS.HOLD_WAIT, { id: "h/1" })).toBe("/v1/holds/h%2F1/wait");
  expect(apiPath(API_ENDPOINTS.AGENT_POLICY_VERSION, { id: "a", version: 2 })).toBe(
    "/v1/agents/a/policy/versions/2",
  );
  expect(apiPath(API_ENDPOINTS.PLANS)).toBe("/v1/plans");
  expect(() => apiPath(API_ENDPOINTS.RUN)).toThrow(/planId/);
});

test("every endpoint is versioned or one of the unversioned infrastructure paths", () => {
  for (const path of Object.values(API_ENDPOINTS)) {
    expect(path).toMatch(/^\/(v1\/|health|events)/);
  }
});
