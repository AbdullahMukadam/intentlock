import { describe, expect, it } from "vitest";

import { docsUrl } from "@/lib/docs-url";

describe("docsUrl", () => {
  it("keeps an http(s) URL", () => {
    expect(docsUrl("https://intentlock.dev/docs/")).toBe("https://intentlock.dev/docs/");
    expect(docsUrl("http://localhost:4321/docs/")).toBe("http://localhost:4321/docs/");
  });

  it("hides the link when unset, empty or not an http(s) URL", () => {
    expect(docsUrl(undefined)).toBeNull();
    expect(docsUrl("")).toBeNull();
    expect(docsUrl("not a url")).toBeNull();
    expect(docsUrl("javascript:alert(1)")).toBeNull();
  });
});
