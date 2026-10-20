import { UserLabelSchema } from "../../../../src/users/schemas/user-fields.schema.js";

describe("UserLabelSchema", () => {
  it("accepts short display labels and trims them", () => {
    expect(UserLabelSchema.parse("bot")).toBe("bot");
    expect(UserLabelSchema.parse("  CI runner ")).toBe("CI runner");
    expect(UserLabelSchema.parse("contractor.v2_x-1")).toBe("contractor.v2_x-1");
  });

  it("clears with null or an empty string", () => {
    expect(UserLabelSchema.parse(null)).toBeNull();
    expect(UserLabelSchema.parse("   ")).toBeNull();
  });

  it("rejects long labels, markup and leading punctuation", () => {
    expect(UserLabelSchema.safeParse("x".repeat(25)).success).toBe(false);
    expect(UserLabelSchema.safeParse("<b>bot</b>").success).toBe(false);
    expect(UserLabelSchema.safeParse("-bot").success).toBe(false);
    expect(UserLabelSchema.safeParse("bot\nadmin").success).toBe(false);
  });
});
