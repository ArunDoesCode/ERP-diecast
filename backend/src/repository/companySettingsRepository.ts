import { eq } from "drizzle-orm";

import { db } from "../db/client";
import { companySettings } from "../db/schemas/04_company";
import type { companySettingsUpsertSchemaType } from "../types/sco.types";

export const companySettingsRepository = {
  async get() {
    const [row] = await db
      .select()
      .from(companySettings)
      .where(eq(companySettings.id, 1))
      .limit(1);
    return row ?? null;
  },

  // The table holds one row (id = 1): create it, or replace its four fields.
  async upsert(input: companySettingsUpsertSchemaType, actorId: number) {
    const now = new Date();
    const [row] = await db
      .insert(companySettings)
      .values({ id: 1, ...input, updatedBy: actorId, updatedAt: now })
      .onConflictDoUpdate({
        target: companySettings.id,
        set: { ...input, updatedBy: actorId, updatedAt: now },
      })
      .returning();
    if (!row) {
      throw new Error("Company settings upsert returned no row");
    }
    return row;
  },
};
