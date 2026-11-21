import { sql } from "drizzle-orm";
import {
  bigint,
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
    // supplier-invoice BR-SINV-32: match tolerances in basis points (50 = 0.5%), 0-10%.
    priceToleranceBp: integer("price_tolerance_bp").notNull().default(0),
    weightToleranceBp: integer("weight_tolerance_bp").notNull().default(50),
    // dispatch BR-DSP-23: same-state e-way bill limit in paise (default Rs 50,000)
    ewayIntraLimitPaise: bigint("eway_intra_limit_paise", { mode: "number" })
      .notNull()
      .default(5000000),
    // no-index: audit one row
    updatedBy: integer("updated_by").references(() => employees.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    singleRow: check("company_settings_single_row", sql`${t.id} = 1`),
    priceTolRange: check(
      "company_settings_price_tol_range",
      sql`${t.priceToleranceBp} between 0 and 1000`,
    ),
    ewayLimitRange: check(
      "company_settings_eway_limit_range",
      sql`${t.ewayIntraLimitPaise} between 1 and 10000000000`,
    ),
    weightTolRange: check(
      "company_settings_weight_tol_range",
      sql`${t.weightToleranceBp} between 0 and 1000`,
    ),
  }),
);

// BR-SCO-29: one row per changed company-settings field (old -> new, who,
// when). Append-only: rows are never edited or deleted.
export const companySettingsHistory = pgTable(
  "company_settings_history",
  {
    id: serial("id").primaryKey(),
    // name | address | gstin | stateCode | priceToleranceBp | weightToleranceBp | ewayIntraLimitPaise
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
