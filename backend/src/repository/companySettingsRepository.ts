import { count, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { employees } from "../db/schemas/03_hcm";
import {
  companySettings,
  companySettingsHistory,
} from "../db/schemas/04_company";
import type { companySettingsUpsertSchemaType } from "../types/sco.types";

const TRACKED_FIELDS = ["name", "address", "gstin", "stateCode"] as const;

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
  // BR-SCO-29: one history row per changed field, in the same transaction;
  // the current row is locked first so two saves cannot both read old values.
  async upsert(input: companySettingsUpsertSchemaType, actorId: number) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(companySettings)
        .where(eq(companySettings.id, 1))
        .limit(1)
        .for("update");
      const changes: {
        field: string;
        oldValue: string | null;
        newValue: string;
        createdBy: number;
      }[] = TRACKED_FIELDS.filter(
        (field) => current?.[field] !== input[field],
      ).map((field) => ({
        field,
        oldValue: current?.[field] ?? null,
        newValue: input[field],
        createdBy: actorId,
      }));
      // BR-DSP-42: the e-way limit is optional on the body; omitted = unchanged.
      if (
        input.ewayIntraLimitPaise !== undefined &&
        current?.ewayIntraLimitPaise !== input.ewayIntraLimitPaise
      ) {
        changes.push({
          field: "ewayIntraLimitPaise",
          oldValue:
            current?.ewayIntraLimitPaise === undefined
              ? null
              : String(current.ewayIntraLimitPaise),
          newValue: String(input.ewayIntraLimitPaise),
          createdBy: actorId,
        });
      }
      if (current && changes.length === 0) {
        // nothing changed: no history row, audit stamp untouched
        return current;
      }
      const now = new Date();
      const [row] = await tx
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
      await tx.insert(companySettingsHistory).values(changes);
      return row;
    });
  },

  // BR-SINV-32: change one or both tolerances (basis points) on the existing row; one
  // history row per changed field, same transaction. Returns undefined when there is
  // no company row yet.
  async updateTolerances(
    input: { priceToleranceBp?: number; weightToleranceBp?: number },
    actorId: number,
  ) {
    return db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(companySettings)
        .where(eq(companySettings.id, 1))
        .limit(1)
        .for("update");
      if (!current) {
        return undefined;
      }
      const changes = (["priceToleranceBp", "weightToleranceBp"] as const)
        .filter(
          (field) =>
            input[field] !== undefined && input[field] !== current[field],
        )
        .map((field) => ({
          field,
          oldValue: String(current[field]),
          newValue: String(input[field]),
          createdBy: actorId,
        }));
      if (changes.length === 0) {
        return current;
      }
      const [row] = await tx
        .update(companySettings)
        .set({ ...input, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(companySettings.id, 1))
        .returning();
      await tx.insert(companySettingsHistory).values(changes);
      return row;
    });
  },

  // BR-SCO-29: newest first.
  async listHistory(page: number, pageSize: number) {
    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: companySettingsHistory.id,
          field: companySettingsHistory.field,
          oldValue: companySettingsHistory.oldValue,
          newValue: companySettingsHistory.newValue,
          changedBy: companySettingsHistory.createdBy,
          changedByName: employees.name,
          changedAt: companySettingsHistory.createdAt,
        })
        .from(companySettingsHistory)
        .leftJoin(employees, eq(employees.id, companySettingsHistory.createdBy))
        // matches idx_company_settings_history_created_at (DESC NULLS LAST)
        .orderBy(
          sql`${companySettingsHistory.createdAt} desc nulls last`,
          sql`${companySettingsHistory.id} desc nulls last`,
        )
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(companySettingsHistory),
    ]);
    return { rows, total: totalRow?.value ?? 0 };
  },
};
