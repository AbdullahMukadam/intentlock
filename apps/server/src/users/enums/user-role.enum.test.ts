import { Role } from "../../generated/prisma/client.js";
import { UserRole } from "./user-role.enum.js";

it("matches the Prisma Role enum", () => {
  expect(Object.values(UserRole).sort()).toEqual(Object.values(Role).sort());
});
