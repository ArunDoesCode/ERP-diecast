import { asc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { screens } from "../db/schemas/01_auth";
import type { PartialUpdate } from "../lib/types";
import type { DbExecutor } from "./executor";

const screenColumns = {
  key: screens.key,
  path: screens.path,
  permissionKey: screens.permissionKey,
  label: screens.label,
  sortOrder: screens.sortOrder,
  menuGroup: screens.menuGroup,
};

type ScreenUpdateData = PartialUpdate<{
  label: string;
  sortOrder: number;
  menuGroup: string;
}>;

export const screenRepository = {
  async list() {
    return db
      .select(screenColumns)
      .from(screens)
      .orderBy(
        asc(screens.menuGroup),
        asc(screens.sortOrder),
        asc(screens.key),
      );
  },

  async findByKey(key: string, exec: DbExecutor = db) {
    const [row] = await exec
      .select(screenColumns)
      .from(screens)
      .where(eq(screens.key, key))
      .limit(1);
    return row;
  },

  async update(key: string, data: ScreenUpdateData, exec: DbExecutor = db) {
    const [row] = await exec
      .update(screens)
      .set(data)
      .where(eq(screens.key, key))
      .returning(screenColumns);
    return row;
  },
};
