import { and, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { rolePages } from "../db/schemas/01_auth";

const rolePageColumns = {
  id: rolePages.id,
  roleId: rolePages.roleId,
  pageId: rolePages.pageId,
};

export const permissionRepository = {
  async listAll() {
    return db.select(rolePageColumns).from(rolePages);
  },

  async listByRoleId(roleId: number) {
    return db
      .select(rolePageColumns)
      .from(rolePages)
      .where(eq(rolePages.roleId, roleId));
  },

  async applyDiff(roleId: number, added: number[], deleted: number[]) {
    await db.transaction(async (tx) => {
      if (added.length > 0) {
        await tx
          .insert(rolePages)
          .values(added.map((pageId) => ({ roleId, pageId })))
          .onConflictDoNothing({
            target: [rolePages.roleId, rolePages.pageId],
          });
      }

      if (deleted.length > 0) {
        await tx
          .delete(rolePages)
          .where(
            and(
              eq(rolePages.roleId, roleId),
              inArray(rolePages.pageId, deleted),
            ),
          );
      }
    });
  },
};
