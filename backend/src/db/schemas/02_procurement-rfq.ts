import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
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
import { itemMaster } from "./02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseRequestItems,
} from "./02_procurement-purchasing";
import { supplierMaster } from "./02_procurement-suppliers";
import { employees } from "./03_hcm";

// RFQ, supplier quotes, award and rate contracts (docs/specs/rfq/design/data.md).
// Cross-file FKs use lazy references: purchase_order_items points back here.

// numeric(14,3) read as number (BR-RFQ-03: qty has 3 decimals).
const qty3Col = (name: string) =>
  numeric(name, { precision: 14, scale: 3, mode: "number" });

// numeric(5,2) GST % read as number (slab list checked in the API).
const gstCol = (name: string) =>
  numeric(name, { precision: 5, scale: 2, mode: "number" });

// no-index: audit who-did-it columns are read only by joining to employees
const whoCol = (name: string) =>
  integer(name).references((): AnyPgColumn => employees.id);

export const rfqStatusEnum = pgEnum("rfq_status", [
  "draft",
  "sent",
  "partially_awarded",
  "awarded",
  "closed",
  "cancelled",
]);

export const rfqLineStatusEnum = pgEnum("rfq_line_status", [
  "open",
  "awarded",
  "dropped",
]);

export const rfqQuoteStatusEnum = pgEnum("rfq_quote_status", [
  "draft",
  "submitted",
  "cancelled",
  "not_awarded",
]);

export const rateContractStatusEnum = pgEnum("rate_contract_status", [
  "draft",
  "active",
  "terminated",
  "cancelled",
]);

// --- RFQ header (BR-RFQ-05..07, 35..37, 71) ---
export const rfqs = pgTable(
  "rfqs",
  {
    id: serial("id").primaryKey(),
    // RFQ-<YYYY-MM>-<seq> (BR-RFQ-05), never reused
    rfqNumber: text("rfq_number").unique().notNull(),
    status: rfqStatusEnum("status").default("draft").notNull(),
    // IST calendar day, not before today at create / edit
    dueDate: date("due_date").notNull(),
    notes: text("notes"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references((): AnyPgColumn => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUpdatedBy: whoCol("last_updated_by"),
    lastUpdatedAt: timestamp("last_updated_at"),
    sentBy: whoCol("sent_by"),
    sentAt: timestamp("sent_at"),
    // set when the status becomes `awarded` (BR-RFQ-34)
    completedAt: timestamp("completed_at"),
    closedBy: whoCol("closed_by"),
    closedAt: timestamp("closed_at"),
    closeReason: text("close_reason"),
    cancelledBy: whoCol("cancelled_by"),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    index("idx_rfqs_status").on(table.status),
    index("idx_rfqs_created_at").on(table.createdAt.desc()),
    // List `q` search: pg_trgm GIN indexes
    index("idx_rfqs_rfq_number_trgm").using(
      "gin",
      table.rfqNumber.op("gin_trgm_ops"),
    ),
    index("idx_rfqs_notes_trgm").using("gin", table.notes.op("gin_trgm_ops")),
  ],
);

// --- Suppliers invited to an RFQ (BR-RFQ-04, 06) ---
export const rfqSuppliers = pgTable(
  "rfq_suppliers",
  {
    id: serial("id").primaryKey(),
    rfqId: integer("rfq_id")
      .references((): AnyPgColumn => rfqs.id)
      .notNull(),
    supplierId: integer("supplier_id")
      .references((): AnyPgColumn => supplierMaster.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // also serves the rfq_id FK lookup
    uniqueIndex("uq_rfq_suppliers_rfq_supplier").on(
      table.rfqId,
      table.supplierId,
    ),
    index("idx_rfq_suppliers_supplier").on(table.supplierId),
  ],
);

// --- RFQ lines: one per PR line (BR-RFQ-01..03, 11, 25, 27, 31, 34, 35) ---
export const rfqItems = pgTable(
  "rfq_items",
  {
    id: serial("id").primaryKey(),
    rfqId: integer("rfq_id")
      .references((): AnyPgColumn => rfqs.id)
      .notNull(),
    prItemId: integer("pr_item_id")
      .references((): AnyPgColumn => purchaseRequestItems.id)
      .notNull(),
    itemId: integer("item_id")
      .references((): AnyPgColumn => itemMaster.id)
      .notNull(),
    // PR line requestedQty - issuedQty at add time; never editable (BR-RFQ-03)
    qty: qty3Col("qty").notNull(),
    uom: text("uom").notNull(),
    // no-index: covered:uq_rfq_items_open_pr_item partial index where line_status = open, filtered with pr_item_id
    lineStatus: rfqLineStatusEnum("line_status").default("open").notNull(),
    // The single award (BR-RFQ-25). No FK: rfq_items <-> rfq_quote_items would be
    // circular; the service checks the quote line belongs to this line.
    awardedQuoteItemId: integer("awarded_quote_item_id"),
    poItemId: integer("po_item_id").references(
      (): AnyPgColumn => purchaseOrderItems.id,
    ),
    awardedBy: whoCol("awarded_by"),
    awardedAt: timestamp("awarded_at"),
    // required when the chosen quote line is not the lowest eligible (BR-RFQ-27)
    awardReason: text("award_reason"),
    // paise per item uom, snapshot at award (audit, BR-RFQ-71)
    awardLowestLandedPaise: bigint("award_lowest_landed_paise", {
      mode: "number",
    }),
    awardChosenLandedPaise: bigint("award_chosen_landed_paise", {
      mode: "number",
    }),
    // set when the RFQ closes / cancels, or the PR line is found cancelled at award
    droppedAt: timestamp("dropped_at"),
  },
  (table) => [
    uniqueIndex("uq_rfq_items_rfq_pr_item").on(table.rfqId, table.prItemId),
    // BR-RFQ-02 in the database: a PR line is open on at most one RFQ
    uniqueIndex("uq_rfq_items_open_pr_item")
      .on(table.prItemId)
      .where(sql`${table.lineStatus} = 'open'`),
    index("idx_rfq_items_rfq").on(table.rfqId),
    index("idx_rfq_items_item").on(table.itemId),
    uniqueIndex("uq_rfq_items_awarded_quote_item")
      .on(table.awardedQuoteItemId)
      .where(sql`${table.awardedQuoteItemId} is not null`),
    index("idx_rfq_items_po_item").on(table.poItemId),
  ],
);

// --- Supplier quote header (BR-RFQ-12..19, 24, 34) ---
export const rfqQuotes = pgTable(
  "rfq_quotes",
  {
    id: serial("id").primaryKey(),
    // SQ-<YYYY-MM>-<seq> (counter `rfq_quote`)
    quoteNumber: text("quote_number").unique().notNull(),
    rfqId: integer("rfq_id")
      .references((): AnyPgColumn => rfqs.id)
      .notNull(),
    supplierId: integer("supplier_id")
      .references((): AnyPgColumn => supplierMaster.id)
      .notNull(),
    // "awarded" is derived from rfq_items.awarded_quote_item_id
    // no-index: covered:idx_rfq_quotes_rfq_status always filtered with rfq_id, which leads it
    status: rfqQuoteStatusEnum("status").default("draft").notNull(),
    supplierQuoteRef: text("supplier_quote_ref").notNull(),
    quoteDate: date("quote_date").notNull(),
    // eligibility valid_till >= today is computed, never stored (BR-RFQ-22)
    validTill: date("valid_till").notNull(),
    paymentTermsDays: integer("payment_terms_days").default(0).notNull(),
    // set at submit: submit day (IST) > RFQ due date (BR-RFQ-17)
    isLate: boolean("is_late").default(false).notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references((): AnyPgColumn => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUpdatedBy: whoCol("last_updated_by"),
    lastUpdatedAt: timestamp("last_updated_at"),
    submittedBy: whoCol("submitted_by"),
    // last tie-break of the comparison (BR-RFQ-23)
    submittedAt: timestamp("submitted_at"),
    cancelledBy: whoCol("cancelled_by"),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    // BR-RFQ-13 QUOTE_EXISTS: one live quote per supplier per RFQ
    uniqueIndex("uq_rfq_quotes_live")
      .on(table.rfqId, table.supplierId)
      .where(sql`${table.status} in ('draft', 'submitted')`),
    index("idx_rfq_quotes_rfq_status").on(table.rfqId, table.status),
    index("idx_rfq_quotes_supplier").on(table.supplierId),
    index("idx_rfq_quotes_quote_number_trgm").using(
      "gin",
      table.quoteNumber.op("gin_trgm_ops"),
    ),
  ],
);

// --- Supplier quote lines: one per RFQ line (BR-RFQ-15, 16, 20..23, 26, 31) ---
export const rfqQuoteItems = pgTable(
  "rfq_quote_items",
  {
    id: serial("id").primaryKey(),
    quoteId: integer("quote_id")
      .references((): AnyPgColumn => rfqQuotes.id)
      .notNull(),
    rfqItemId: integer("rfq_item_id")
      .references((): AnyPgColumn => rfqItems.id)
      .notNull(),
    // false = "not quoted"; the value columns are then null
    // no-index: low-card boolean, always filtered with the quote id
    isQuoted: boolean("is_quoted").notNull(),
    // paise per item uom, >= 1
    ratePaise: bigint("rate_paise", { mode: "number" }),
    gstPercent: gstCol("gst_percent"),
    leadDays: integer("lead_days"),
    // whole line, paise, <= 1e12 (BR-RFQ-30)
    freightPaise: bigint("freight_paise", { mode: "number" }),
    // computeLinePaise, the same function as PO lines (BR-RFQ-16)
    lineValuePaise: bigint("line_value_paise", { mode: "number" }),
    lineTaxPaise: bigint("line_tax_paise", { mode: "number" }),
    // rate + round(freight / qty), stored so sorting is cheap
    landedRatePaise: bigint("landed_rate_paise", { mode: "number" }),
  },
  (table) => [
    // one row per RFQ line; also serves the quote_id FK lookup
    uniqueIndex("uq_rfq_quote_items_quote_rfq_item").on(
      table.quoteId,
      table.rfqItemId,
    ),
    index("idx_rfq_quote_items_rfq_item").on(table.rfqItemId),
  ],
);

// --- Rate contract header (BR-RFQ-40, 43..49) ---
export const rateContracts = pgTable(
  "rate_contracts",
  {
    id: serial("id").primaryKey(),
    // RC-<YYYY-MM>-<seq>
    contractNumber: text("contract_number").unique().notNull(),
    supplierId: integer("supplier_id")
      .references((): AnyPgColumn => supplierMaster.id)
      .notNull(),
    // `expired` is computed: active and valid_to < today (BR-RFQ-47)
    status: rateContractStatusEnum("status").default("draft").notNull(),
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to").notNull(),
    // % 0-20 (BR-RFQ-40, 52)
    allowancePercent: numeric("allowance_percent", {
      precision: 4,
      scale: 2,
      mode: "number",
    })
      .default(0)
      .notNull(),
    notes: text("notes"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references((): AnyPgColumn => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUpdatedBy: whoCol("last_updated_by"),
    lastUpdatedAt: timestamp("last_updated_at"),
    activatedBy: whoCol("activated_by"),
    activatedAt: timestamp("activated_at"),
    // the contract is usable through this day (BR-RFQ-48)
    terminatedOn: date("terminated_on"),
    terminatedBy: whoCol("terminated_by"),
    terminatedAt: timestamp("terminated_at"),
    terminateReason: text("terminate_reason"),
    cancelledBy: whoCol("cancelled_by"),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    // rate lookup on PO draft and the overlap check
    index("idx_rate_contracts_supplier_status").on(
      table.supplierId,
      table.status,
    ),
    index("idx_rate_contracts_status_valid_to").on(table.status, table.validTo),
    index("idx_rate_contracts_contract_number_trgm").using(
      "gin",
      table.contractNumber.op("gin_trgm_ops"),
    ),
  ],
);

// --- Rate contract lines (BR-RFQ-41, 49, 52) ---
export const rateContractItems = pgTable(
  "rate_contract_items",
  {
    id: serial("id").primaryKey(),
    contractId: integer("contract_id")
      .references((): AnyPgColumn => rateContracts.id)
      .notNull(),
    itemId: integer("item_id")
      .references((): AnyPgColumn => itemMaster.id)
      .notNull(),
    // item uom copy
    uom: text("uom").notNull(),
    // paise per uom, >= 1
    ratePaise: bigint("rate_paise", { mode: "number" }).notNull(),
    gstPercent: gstCol("gst_percent").notNull(),
    // null = rate-only (BR-RFQ-41, 52)
    agreedQty: qty3Col("agreed_qty"),
  },
  (table) => [
    // also serves the contract_id FK lookup
    uniqueIndex("uq_rate_contract_items_contract_item").on(
      table.contractId,
      table.itemId,
    ),
    index("idx_rate_contract_items_item").on(table.itemId),
  ],
);
