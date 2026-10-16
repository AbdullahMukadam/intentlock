import { Logger } from "@nestjs/common";

import { loadEnv } from "../../../src/config/env.schema.js";
import { MailService } from "../../../src/mail/mail.service.js";

const base = { DATABASE_URL: "postgresql://x@localhost/db" };

describe("MailService", () => {
  it("is off without SMTP_URL and sends nothing", async () => {
    const mail = new MailService(loadEnv(base));
    expect(mail.enabled).toBe(false);
    expect(await mail.send("a@test.dev", "s", "t")).toBe(false);
  });

  it("reports a failed send as false instead of throwing", async () => {
    vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const mail = new MailService(
      loadEnv({ ...base, SMTP_URL: "smtp://127.0.0.1:1", SMTP_FROM: "x@test.dev" }),
    );
    expect(mail.enabled).toBe(true);
    expect(await mail.sendInvite("a@test.dev", "http://x/invite/t", "Acme", "boss@acme.dev")).toBe(
      false,
    );
  });
});
