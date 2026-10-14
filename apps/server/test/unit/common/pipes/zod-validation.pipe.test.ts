import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

import { zodDto } from "../../../../src/common/utils/zod-dto.util.js";
import { ZodValidationPipe } from "../../../../src/common/pipes/zod-validation.pipe.js";

describe("ZodValidationPipe", () => {
  const pipe = new ZodValidationPipe();
  class Body extends zodDto(z.object({ name: z.string().min(1) })) {}
  const body = { type: "body", metatype: Body } as const;

  it("returns parsed data", () => {
    expect(pipe.transform({ name: "x", extra: 1 }, body)).toEqual({ name: "x" });
  });

  it("throws 400 with field paths", () => {
    try {
      pipe.transform({ name: "" }, body);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({
        error: "validation_failed",
        issues: [{ path: "name" }],
      });
    }
  });

  it("fails closed when an argument has no schema", () => {
    expect(() => pipe.transform("x", { type: "param", metatype: String })).toThrow(/No zod schema/);
  });

  it("leaves custom decorators alone", () => {
    expect(pipe.transform("u", { type: "custom" })).toBe("u");
  });
});
