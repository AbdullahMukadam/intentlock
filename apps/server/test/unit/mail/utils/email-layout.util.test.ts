import { emailHtml } from "../../../../src/mail/utils/email-layout.util.js";

const evil = '<script>steal()</script>"';

describe("emailHtml", () => {
  it("escapes every caller value and keeps the link as button and fallback", () => {
    const html = emailHtml({
      preheader: evil,
      eyebrow: evil,
      accent: "#2563eb",
      title: evil,
      intro: evil,
      details: [{ label: evil, value: evil, mono: true }],
      code: { label: evil, value: evil },
      button: { label: evil, href: 'https://il.acme.dev/invite/t?a=1&b="x"' },
      note: evil,
      footer: evil,
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;steal()&lt;/script&gt;&quot;");
    expect(
      html.match(/href="https:\/\/il\.acme\.dev\/invite\/t\?a=1&amp;b=&quot;x&quot;"/g),
    ).toHaveLength(2);
  });

  it("leaves out the optional sections when they are not given", () => {
    const html = emailHtml({
      preheader: "p",
      eyebrow: "e",
      accent: "#18181b",
      title: "t",
      intro: "i",
      button: { label: "b", href: "https://x.dev" },
      footer: "f",
    });
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("width:96px");
  });
});
