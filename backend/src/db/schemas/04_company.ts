import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { employees } from "./03_hcm";

// BR-SCO-09: our own name, address, GSTIN and state for the job-work challan.
// One row only (id = 1); the owner edits it, the API upserts it.
export const companySettings = pgTable(
  "company_settings",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull(),
    address: text("address").notNull(),
    gstin: text("gstin").notNull(),
    // Two-digit GST state code (first two digits of the GSTIN), used by BR-SCO-10.
    stateCode: text("state_code").notNull(),
    // no-index: audit one row
    updatedBy: integer("updated_by").references(() => employees.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    singleRow: check("company_settings_single_row", sql`${t.id} = 1`),
  }),
);

// BR-SCO-29: one row per changed company-settings field (old -> new, who,
// when). Append-only: rows are never edited or deleted.
export const companySettingsHistory = pgTable(
  "company_settings_history",
  {
    id: serial("id").primaryKey(),
    // name | address | gstin | stateCode
    field: text("field").notNull(),
    // null on the first save (nothing before it)
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // history is read newest first
    createdAtIdx: index("idx_company_settings_history_created_at").on(
      t.createdAt.desc(),
      t.id.desc(),
    ),
  }),
);
