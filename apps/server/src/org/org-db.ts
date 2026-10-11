import type { PrismaClient } from "../generated/prisma/client.js";

const UNSCOPED_MODELS = new Set(["Organization"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

type Args = { where?: object; data?: object | object[]; create?: object };

/**
 * A client whose every model query is pinned to one organization (CLAUDE.md "orgId everywhere"):
 * filters get `orgId` added, creates get it overwritten. Raw SQL (`$queryRaw`) is not covered;
 * add `"orgId" = $n` by hand there.
 */
export function orgDb(prisma: PrismaClient, orgId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (UNSCOPED_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Args;
          if (CREATE_OPS.has(operation)) {
            a.data = Array.isArray(a.data)
              ? a.data.map((d) => ({ ...d, orgId }))
              : { ...a.data, orgId };
          } else {
            a.where = { ...a.where, orgId };
            if (operation === "upsert") a.create = { ...a.create, orgId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type OrgDb = ReturnType<typeof orgDb>;
