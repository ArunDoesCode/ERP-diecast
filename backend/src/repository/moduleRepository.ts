import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { modules } from "../db/schemas/01_auth";

export const moduleRepository = {
  async list() {
    return db.select({ id: modules.id, name: modules.name }).from(modules);
  },

  async findById(id: number) {
    const [row] = await db
      .select({ id: modules.id, name: modules.name })
      .from(modules)
      .where(eq(modules.id, id))
      .limit(1);
    return row;
  },
};
