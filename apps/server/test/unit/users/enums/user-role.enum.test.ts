import { Role as CoreRole } from "@intentlock/core";

import { Role } from "../../../../src/generated/prisma/client.js";
import { UserRole } from "../../../../src/users/enums/user-role.enum.js";

it("matches the Prisma Role enum and core's Role", () => {
  const values = Object.values(UserRole).sort();
  expect(values).toEqual(Object.values(Role).sort());
  expect(values).toEqual([...CoreRole.options].sort());
});
