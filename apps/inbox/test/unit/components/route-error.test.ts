import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { RouteError } from "../../../src/components/route-error";

function render(error: Error & { digest?: string }) {
  return renderToStaticMarkup(createElement(RouteError, { error, reset: () => undefined }));
}

describe("RouteError", () => {
  test("offers a retry and never shows the raw error message", () => {
    const html = render(new Error("TypeError: cannot read secret of undefined"));
    expect(html).toContain("This page hit a problem");
    expect(html).toContain("Try again");
    expect(html).not.toContain("secret");
  });

  test("shows the digest as a reference when Next provides one", () => {
    expect(render(Object.assign(new Error("x"), { digest: "abc123" }))).toContain(
      "quote reference abc123",
    );
  });
});
