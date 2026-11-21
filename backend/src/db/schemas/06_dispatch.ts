import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  inventoryLedger,
  itemMaster,
  locations,
} from "./02_procurement-catalog";
import { employees } from "./03_hcm";
import { customers, saleOrderLines, saleOrders } from "./05_sales";

// Dispatch: delivery note against a sale order. design/data.md. Quantities
// numeric(14,3), money bigint paise, plant days `date` (IST).
export const deliveryNoteStatusEnum = pgEnum("delivery_note_status", [
  "draft",
  "posted",
  "cancelled",
]);

// --- delivery_notes (BR-DSP-01..44) ---
export const deliveryNotes = pgTable(
  "delivery_notes",
  {
    id: serial("id").primaryKey(),
    // BR-DSP-17: DN/<FY>/<seq>, null while draft
    dnNumber: text("dn_number"),
    status: deliveryNoteStatusEnum("status").notNull().default("draft"),
    soId: integer("so_id")
      .references(() => saleOrders.id)
      .notNull(),
    // BR-DSP-02: copied from the SO and its customer
    soNumber: text("so_number").notNull(),
    customerPoNumber: text("customer_po_number"),
    customerId: integer("customer_id")
      .references(() => customers.id)
      .notNull(),
    customerName: text("customer_name").notNull(),
    customerAddress: text("customer_address").notNull(),
    // null = "unregistered"
    customerGstin: text("customer_gstin"),
    // no-index: low-card ~30 GST state codes
    customerStateCode: text("customer_state_code").notNull(),
    shipToAddress: text("ship_to_address").notNull(),
    shipToStateCode: text("ship_to_state_code").notNull(),
    // BR-DSP-18, 41: copied from company settings at post, null while draft
    companyName: text("company_name"),
    companyAddress: text("company_address"),
    companyGstin: text("company_gstin"),
    companyStateCode: text("company_state_code"),
    // BR-DSP-23: customer state = plant state, fixed at post
    // no-index: low-card two values
    sameState: boolean("same_state").notNull(),
    sourceLocationId: integer("source_location_id")
      .references(() => locations.id)
      .notNull(),
    noteDate: date("note_date").notNull(),
    // BR-DSP-19: sum of lines; a draft holds an indicative value
    taxablePaise: bigint("taxable_paise", { mode: "number" })
      .notNull()
      .default(0),
    gstPaise: bigint("gst_paise", { mode: "number" }).notNull().default(0),
    valuePaise: bigint("value_paise", { mode: "number" }).notNull().default(0),
    // BR-DSP-23: recomputed on every draft save and at post
    // no-index: covered:idx_delivery_notes_eway_missing partial index on this predicate
    ewayRequired: boolean("eway_required").notNull().default(false),
    transportMode: text("transport_mode"),
    vehicleNo: text("vehicle_no"),
    transporterId: text("transporter_id"),
    transporterName: text("transporter_name"),
    transportDocNo: text("transport_doc_no"),
    transportDocDate: date("transport_doc_date"),
    distanceKm: integer("distance_km"),
    ewayBillNo: text("eway_bill_no"),
    ewayBillDate: date("eway_bill_date"),
    remarks: text("remarks"),
    // no-index: audit who-did-it column, read only by joining to employees
    postedBy: integer("posted_by").references(() => employees.id),
    postedAt: timestamp("posted_at"),
    cancelReason: text("cancel_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // BR-DSP-17: nulls allowed (drafts)
    dnNumberUq: uniqueIndex("uq_delivery_notes_dn_number").on(t.dnNumber),
    // BR-DSP-26: cancel frees the number
    ewayBillNoUq: uniqueIndex("uq_delivery_notes_eway_bill_no")
      .on(t.ewayBillNo)
      .where(sql`${t.status} <> 'cancelled' and ${t.ewayBillNo} is not null`),
    // SO screen note list (BR-DSP-38)
    soIdx: index("idx_delivery_notes_so_id").on(t.soId),
    // register filter by customer
    customerDateIdx: index("idx_delivery_notes_customer_date").on(
      t.customerId,
      t.noteDate.desc(),
    ),
    // register default sort and date range
    noteDateIdx: index("idx_delivery_notes_note_date").on(
      t.noteDate.desc(),
      t.id.desc(),
    ),
    // register status filter
    statusDateIdx: index("idx_delivery_notes_status_date").on(
      t.status,
      t.noteDate.desc(),
    ),
    // filter "e-way needed but missing" (BR-DSP-40)
    ewayMissingIdx: index("idx_delivery_notes_eway_missing")
      .on(t.noteDate)
      .where(
        sql`${t.status} = 'draft' and ${t.ewayRequired} and ${t.ewayBillNo} is null`,
      ),
    // serves the FK
    sourceLocationIdx: index("idx_delivery_notes_source_location").on(
      t.sourceLocationId,
    ),
    transportModeCk: check(
      "delivery_notes_transport_mode_ck",
      sql`${t.transportMode} is null or ${t.transportMode} in ('road', 'rail', 'air', 'ship')`,
    ),
    distanceCk: check(
      "delivery_notes_distance_ck",
      sql`${t.distanceKm} is null or ${t.distanceKm} between 1 and 4000`,
    ),
    ewayBillNoCk: check(
      "delivery_notes_eway_bill_no_ck",
      sql`${t.ewayBillNo} is null or ${t.ewayBillNo} ~ '^\\d{12}$'`,
    ),
  }),
);

// --- delivery_note_lines (BR-DSP-03..05, 09, 12, 18, 19, 31) ---
export const deliveryNoteLines = pgTable(
  "delivery_note_lines",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id")
      .references(() => deliveryNotes.id)
      .notNull(),
    soLineId: integer("so_line_id")
      .references(() => saleOrderLines.id)
      .notNull(),
    // copied from the SO line, never changes
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    uom: text("uom").notNull(),
    deliveryDate: date("delivery_date").notNull(),
    // BR-DSP-09: goes to ledger batch_number
    lotNo: text("lot_no"),
    // BR-DSP-18: copied from the item at post
    hsnCode: text("hsn_code"),
    // BR-DSP-19: draft = current SO price; frozen at post
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull(),
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull(),
    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    gstPaise: bigint("gst_paise", { mode: "number" }).notNull(),
    // BR-DSP-12: set at post; cancel reads the cost from this row
    ledgerOutId: integer("ledger_out_id").references(() => inventoryLedger.id),
    // BR-DSP-31: set at cancel
    ledgerInId: integer("ledger_in_id").references(() => inventoryLedger.id),
  },
  (t) => ({
    // detail; also serves the note_id FK
    noteLineUq: uniqueIndex("uq_delivery_note_lines_note_so_line").on(
      t.noteId,
      t.soLineId,
    ),
    // reconciliation: sum of posted qty = SO delivered_qty
    soLineIdx: index("idx_delivery_note_lines_so_line").on(t.soLineId),
    itemIdx: index("idx_delivery_note_lines_item").on(t.itemId),
    ledgerOutIdx: index("idx_delivery_note_lines_ledger_out").on(t.ledgerOutId),
    ledgerInIdx: index("idx_delivery_note_lines_ledger_in").on(t.ledgerInId),
    qtyCk: check("delivery_note_lines_qty_ck", sql`${t.qty} > 0`),
    gstCk: check(
      "delivery_note_lines_gst_ck",
      sql`${t.gstPercent} in (0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40)`,
    ),
  }),
);

// --- delivery_note_packages (BR-DSP-20..22) ---
export const deliveryNotePackages = pgTable(
  "delivery_note_packages",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id")
      .references(() => deliveryNotes.id)
      .notNull(),
    lineId: integer("line_id")
      .references(() => deliveryNoteLines.id)
      .notNull(),
    packageNo: text("package_no").notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    netKg: numeric("net_kg", { precision: 10, scale: 3 }).notNull(),
    grossKg: numeric("gross_kg", { precision: 10, scale: 3 }).notNull(),
    lotNo: text("lot_no"),
  },
  (t) => ({
    // also serves the note_id FK
    notePackageUq: uniqueIndex("uq_delivery_note_packages_note_no").on(
      t.noteId,
      t.packageNo,
    ),
    // FK, packed-qty sum at post
    lineIdx: index("idx_delivery_note_packages_line").on(t.lineId),
    qtyCk: check("delivery_note_packages_qty_ck", sql`${t.qty} > 0`),
    weightCk: check(
      "delivery_note_packages_weight_ck",
      sql`${t.netKg} > 0 and ${t.grossKg} >= ${t.netKg}`,
    ),
  }),
);

// --- delivery_note_transport_history (BR-DSP-27): append-only ---
export const deliveryNoteTransportHistory = pgTable(
  "delivery_note_transport_history",
  {
    id: serial("id").primaryKey(),
    noteId: integer("note_id")
      .references(() => deliveryNotes.id)
      .notNull(),
    // vehicleNo | transporterId | transporterName | transportDocNo |
    // transportDocDate | ewayBillNo | ewayBillDate | distanceKm
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"), // null = cleared
    // no-index: audit who-did-it column, read only by joining to employees
    changedBy: integer("changed_by")
      .references(() => employees.id)
      .notNull(),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => ({
    // history of one note, newest first; also serves the FK
    noteIdx: index("idx_delivery_note_transport_history_note").on(
      t.noteId,
      t.id.desc(),
    ),
  }),
);
