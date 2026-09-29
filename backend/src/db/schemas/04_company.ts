import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
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
    updatedBy: integer("updated_by").references(() => employees.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    singleRow: check("company_settings_single_row", sql`${t.id} = 1`),
  }),
);
