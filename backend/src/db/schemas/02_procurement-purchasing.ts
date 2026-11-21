import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  doublePrecision,
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
import { itemMaster, locations, serviceMaster } from "./02_procurement-catalog";
import { reorderRuns } from "./02_procurement-reorder";
import { supplierMaster } from "./02_procurement-suppliers";
import { employees } from "./03_hcm";
import { saleOrders } from "./05_sales";

// numeric(14,3) read as number; cap maths runs on integer thousandths.
const qty3Col = (name: string) =>
  numeric(name, { precision: 14, scale: 3, mode: "number" });

// 1. Define the Enum
export const prTypeEnum = pgEnum("pr_type", [
  "sale_order", // Tied to a specific Sales Order / Job Order
  "stock_reorder", // Standard replenishment of raw materials/consumables
  "maintenance", // Machine spares, furnace repairs, MRO
  "tooling", // H13 steel, die bases, tool room supplies
  "subcontracting", // Outsourced CNC, plating, external QA
  "misc", // Admin, PPE, general factory supplies
]);

export const prStatusEnum = pgEnum("pr_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "partial_ordered",
  "fully_ordered",
  "cancelled",
]);

// --- 1. PURCHASE REQUEST (PR) ---
export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: serial("id").primaryKey(),
    prNumber: text("pr_number").unique().notNull(),
    // no-index: low-card used with the indexed status filter
    type: prTypeEnum("type").notNull(),
    // Null if stock_reorder or some other option. BR-SO-48: names a confirmed SO (service check).
    saleOrderId: integer("sale_order_id").references(
      (): AnyPgColumn => saleOrders.id,
    ),
    // BR-RO-17: set only by the reorder run; read-only for every PR endpoint
    reorderRunId: integer("reorder_run_id").references(
      (): AnyPgColumn => reorderRuns.id,
    ),
    assetId: integer("asset_id"), // Only populated if type is 'maintenance' or 'tooling' (Optional: link to a specific machine/die)
    status: prStatusEnum("status").default("draft").notNull(),
    // no-index: audit no "my PRs" filter exists
    requestedBy: integer("requested_by")
      .references(() => employees.id)
      .notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    approvedBy: integer("approved_by").references(() => employees.id),
    currentApprovalLevel: integer("current_approval_level")
      .default(0)
      .notNull(),
    totalApprovalLevels: integer("total_approval_levels").default(0).notNull(),
    notes: text("notes"),
    estimatedAmountPaise: bigint("estimated_amount_paise", { mode: "number" })
      .default(0)
      .notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_purchase_requests_status").on(table.status),
    // BR-SO-14, 19: PRs of one SO; serves the FK
    saleOrderIdx: index("idx_purchase_requests_sale_order_id").on(
      table.saleOrderId,
    ),
    // BR-RO-13, 17: one PR per run; serves the FK and the "raised by reorder" filter
    reorderRunUq: uniqueIndex("uq_purchase_requests_reorder_run")
      .on(table.reorderRunId)
      .where(sql`${table.reorderRunId} is not null`),
    // List `q` search (ilike %q%, #54): pg_trgm GIN indexes
    prNumberTrgm: index("idx_purchase_requests_pr_number_trgm").using(
      "gin",
      table.prNumber.op("gin_trgm_ops"),
    ),
    notesTrgm: index("idx_purchase_requests_notes_trgm").using(
      "gin",
      table.notes.op("gin_trgm_ops"),
    ),
  }),
);

export const prItemStatusEnum = pgEnum("pr_item_status", [
  "pending",
  "po_draft",
  "ordered",
  "closed",
  "cancelled",
]);

export const purchaseRequestItems = pgTable(
  "purchase_request_items",
  {
    id: serial("id").primaryKey(),
    prId: integer("pr_id")
      .references(() => purchaseRequests.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(), // Link to your items/master table
    requestedQty: doublePrecision("requested_qty").notNull(),
    issuedQty: doublePrecision("issued_qty").default(0), // How much has been converted to PO
    uom: text("uom").notNull(),
    expectedDate: timestamp("expected_date"),
    status: prItemStatusEnum("status").default("pending").notNull(),
    // Line cancel audit trail (BR-PR-33, 46): why, who, when.
    cancelReason: text("cancel_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    prIdIdx: index("idx_pr_items_pr_id").on(table.prId),
    statusIdx: index("idx_pr_items_status").on(table.status),
    // open-PR supply read of the SO explosion (BR-SO-31)
    itemOpenIdx: index("idx_pr_items_item_open")
      .on(table.itemId)
      .where(sql`${table.status} in ('pending', 'po_draft')`),
    // BR-RO-04: on-the-way sum of pending lines
    itemPendingIdx: index("idx_pr_items_pending_item")
      .on(table.itemId)
      .where(sql`${table.status} = 'pending'`),
    itemIdIdx: index("idx_pr_items_item_id").on(table.itemId),
  }),
);

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "pending_approval",
  "approved",
  "dispatched",
  "partial_received",
  "fully_received",
  "invoiced",
  "closed",
  "cancelled",
]);

// --- 2. PURCHASE ORDER (PO) ---
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: serial("id").primaryKey(),
    poNumber: text("po_number").unique().notNull(),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(), // Link to suppliers table
    status: poStatusEnum("status").default("draft").notNull(),
    // Financials (stored in paise to avoid floating point issues)
    subtotalPaise: bigint("subtotal_paise", { mode: "number" })
      .default(0)
      .notNull(),
    taxAmountPaise: bigint("tax_amount_paise", { mode: "number" })
      .default(0)
      .notNull(),
    totalAmountPaise: bigint("total_amount_paise", { mode: "number" })
      .default(0)
      .notNull(),
    // Terms
    paymentTermsDays: integer("payment_terms_days").default(0), // e.g., 30 for Net 30
    deliveryTerms: text("delivery_terms"),
    notes: text("notes"),
    expectedDeliveryDate: timestamp("expected_delivery_date"),
    // no-index: audit who-did-it column, read only by joining to employees
    approvedBy: integer("approved_by").references(() => employees.id),
    currentApprovalLevel: integer("current_approval_level")
      .default(0)
      .notNull(),
    totalApprovalLevels: integer("total_approval_levels").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    // Delay tracking — expectedDeliveryDate is never overwritten (audit
    // trail); these hold the supplier's revised promise once one is given.
    revisedDeliveryDate: timestamp("revised_delivery_date"),
    delayReason: text("delay_reason"),
    // Supplier confirmation of receipt/acceptance of the PO — informational
    // only, never blocks a status transition.
    supplierConfirmed: boolean("supplier_confirmed").default(false).notNull(),
    confirmationMethod: text("confirmation_method"),
    confirmedAt: timestamp("confirmed_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    confirmedBy: integer("confirmed_by").references(() => employees.id),
    confirmationNote: text("confirmation_note"),
    // Terminal close audit trail — set when a PO transitions to `closed`
    // (legal from `fully_received` or `invoiced`).
    closedAt: timestamp("closed_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    closedBy: integer("closed_by").references(() => employees.id),
    closeNote: text("close_note"),
    // Cancel audit trail (BR-PO-11, 21): who, when, why.
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    // BR-PO-13: closed from partial_received with open qty dropped.
    shortClosed: boolean("short_closed").default(false).notNull(),
    // BR-PO-15, 21: who recorded the supplier invoice, and when.
    // no-index: audit who-did-it column, read only by joining to employees
    invoicedBy: integer("invoiced_by").references(() => employees.id),
    invoicedAt: timestamp("invoiced_at"),
  },
  (table) => ({
    statusIdx: index("idx_purchase_orders_status").on(table.status),
    supplierIdx: index("idx_purchase_orders_supplier_id").on(table.supplierId),
    // List `q` search (ilike %q%, #54): pg_trgm GIN indexes
    poNumberTrgm: index("idx_purchase_orders_po_number_trgm").using(
      "gin",
      table.poNumber.op("gin_trgm_ops"),
    ),
    notesTrgm: index("idx_purchase_orders_notes_trgm").using(
      "gin",
      table.notes.op("gin_trgm_ops"),
    ),
  }),
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: serial("id").primaryKey(),
    poId: integer("po_id").references(() => purchaseOrders.id),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(), // Add reference,
    qty: doublePrecision("qty").notNull(),
    receivedQty: doublePrecision("received_qty").default(0), // Updated by GRN
    // Posted purchase returns (BR-PRT-20, 38)
    returnedQty: qty3Col("returned_qty").default(0).notNull(),
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull(),
    uom: text("uom").notNull(),
    // BR-PO-04: GST % per line (allowed set BR-SUP-13) and the paise maths,
    // stored so the header totals and approval matching never re-derive them.
    gstPercent: doublePrecision("gst_percent").default(0).notNull(),
    lineValuePaise: bigint("line_value_paise", { mode: "number" })
      .default(0)
      .notNull(),
    lineTaxPaise: bigint("line_tax_paise", { mode: "number" })
      .default(0)
      .notNull(),
  },
  (table) => ({
    poIdIdx: index("idx_po_items_po_id").on(table.poId),
    itemIdIdx: index("idx_po_items_item_id").on(table.itemId),
  }),
);

// --- 3. PR TO PO MAPPING (Many-to-Many Resolution) ---
// Because 1 PR can have multiple POs, and 1 PO can have multiple PRs
export const prPoItemLinks = pgTable(
  "pr_po_item_links",
  {
    id: serial("id").primaryKey(),
    prItemId: integer("pr_item_id").references(() => purchaseRequestItems.id),
    poItemId: integer("po_item_id").references(() => purchaseOrderItems.id),
    linkedQty: doublePrecision("linked_qty").notNull(),
  },
  (table) => ({
    prItemIdx: index("idx_pr_po_links_pr_item_id").on(table.prItemId),
    poItemIdx: index("idx_pr_po_links_po_item_id").on(table.poItemId),
  }),
);

export const poCommunicationTypeEnum = pgEnum("po_communication_type", [
  "po_sent",
  "reminder",
  "escalation",
  "confirmation",
]);

export const poCommunicationChannelEnum = pgEnum("po_communication_channel", [
  "email",
  "whatsapp",
  "phone",
  "in_person",
]);

export const poCommunicationStatusEnum = pgEnum("po_communication_status", [
  "logged",
  "success",
  "failed",
]);

// Manual-log-only communication trail for now (no SMTP wiring in this repo
// yet) — shaped so real auto-email can be added later without a schema
// change. `type=po_sent`'s latest row is what flips a PO to `dispatched`;
// `reminder`/`escalation` rows are just log entries for the overdue queue.
export const poCommunications = pgTable(
  "po_communications",
  {
    id: serial("id").primaryKey(),
    poId: integer("po_id")
      .references(() => purchaseOrders.id)
      .notNull(),
    type: poCommunicationTypeEnum("type").notNull(),
    channel: poCommunicationChannelEnum("channel").notNull(),
    status: poCommunicationStatusEnum("status").default("logged").notNull(),
    toEmail: text("to_email"),
    note: text("note"),
    errorMessage: text("error_message"),
    // no-index: audit who-did-it column, read only by joining to employees
    sentBy: integer("sent_by").references(() => employees.id),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => ({
    poSentIdx: index("idx_po_communications_po_id_sent_at").on(
      table.poId,
      table.sentAt,
    ),
  }),
);

export const scoStatusEnum = pgEnum("sco_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "require_more_info",
  "material_issued",
  "material_received",
  "closed",
  "cancelled",
]);

export const subcontractingOrders = pgTable(
  "subcontracting_orders",
  {
    id: serial("id").primaryKey(),
    scoNumber: text("sco_number").unique().notNull(),
    vendorId: integer("vendor_id")
      .references(() => supplierMaster.id)
      .notNull(),
    // no-index: low-card 9 values; lists by vendor use `idx_sco_vendor_status`, newest-first uses `idx_sco_created_at`
    status: scoStatusEnum("status").default("draft").notNull(),

    // Link to the internal Job Order or Project this service is for (for cost accounting)
    projectRef: text("project_ref"),

    notes: text("notes"),
    // BR-SCO-03: required, today .. today + 365 days (checked by the API).
    expectedReturnDate: timestamp("expected_return_date").notNull(),
    // BR-SCO-04: money in paise. subtotal = sum(service price x return qty), no GST.
    subtotalPaise: bigint("subtotal_paise", { mode: "number" })
      .default(0)
      .notNull(),
    taxAmountPaise: bigint("tax_amount_paise", { mode: "number" })
      .default(0)
      .notNull(),
    totalAmountPaise: bigint("total_amount_paise", { mode: "number" })
      .default(0)
      .notNull(),
    // Approval mirror, same as PR/PO (BR-SCO-06).
    // no-index: audit who-did-it column, read only by joining to employees
    approvedBy: integer("approved_by").references(() => employees.id),
    currentApprovalLevel: integer("current_approval_level")
      .default(0)
      .notNull(),
    totalApprovalLevels: integer("total_approval_levels").default(0).notNull(),
    // Kept nullable (older rows); the API always sets it and checks it on submit (BR-SCO-06).
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
    // BR-SCO-20: cancel who, when, why.
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    // BR-SCO-19: close who, when, why (reason only when a loss is written off).
    // no-index: audit who-did-it column, read only by joining to employees
    closedBy: integer("closed_by").references(() => employees.id),
    closedAt: timestamp("closed_at"),
    closeReason: text("close_reason"),
  },
  (t) => ({
    vendorStatusIdx: index("idx_sco_vendor_status").on(t.vendorId, t.status),
    createdAtIdx: index("idx_sco_created_at").on(t.createdAt.desc()),
    // SCO list `q` search (ilike %q%, #62)
    scoNumberTrgm: index("idx_sco_sco_number_trgm").using(
      "gin",
      t.scoNumber.op("gin_trgm_ops"),
    ),
  }),
);

export const subcontractingOrderItems = pgTable(
  "subcontracting_order_items",
  {
    id: serial("id").primaryKey(),
    scoId: integer("sco_id")
      .references(() => subcontractingOrders.id)
      .notNull(),

    // 1. WHAT WE SEND OUT (Raw Material OR WIP)
    // We keep it linked to the `itemMaster` (e.g., "Pump Housing - Raw Cast"),
    // but we add Batch/Heat tracking for die-casting traceability.
    rawItemId: integer("raw_item_id")
      .references(() => itemMaster.id)
      .notNull(),
    rawItemBatch: text("raw_item_batch"), // CRITICAL: Heat Number or Melt Number for traceability!
    // BR-SCO-02: send qty, whole pieces > 0.
    rawQtyToIssue: integer("raw_qty_to_issue").notNull(),

    // 2. THE SERVICE (Decoupled from the physical `itemMaster`!)
    // Services don't have stock, so they don't belong in the `itemMaster` table.
    // BR-SCO-02: the vendor's service (price + GST % below are copied from its price list).
    serviceId: integer("service_id")
      .references(() => serviceMaster.id)
      .notNull(),
    serviceDescription: text("service_description").notNull(), // service name copied at create
    serviceHsnSacCode: text("service_hsn_sac_code"), // GST SAC Code (e.g., 9988 for manufacturing services)
    serviceUnitPricePaise: bigint("service_unit_price_paise", {
      mode: "number",
    }).notNull(),
    serviceTaxPercentage: doublePrecision("service_tax_percentage")
      .default(18)
      .notNull(), // Usually 18% for job work

    // 3. WHAT WE GET BACK (Finished Good)
    finishedItemId: integer("finished_item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // BR-SCO-02: return qty, whole pieces > 0. Ratio = send qty / return qty.
    expectedReturnQty: integer("expected_return_qty").notNull(),
    // Running counters, whole pieces (BR-SCO-07, 12-16, 18, 19); moved only by posting actions.
    issuedQty: integer("issued_qty").default(0).notNull(),
    acceptedQty: integer("accepted_qty").default(0).notNull(),
    rejectedQty: integer("rejected_qty").default(0).notNull(),
    unprocessedQty: integer("unprocessed_qty").default(0).notNull(),
    lossQty: integer("loss_qty").default(0).notNull(),
    // BR-SCO-12/13: processed qty received but awaiting its QA decision (reserved at the
    // vendor so at-vendor = issued - (accepted+rejected+pending) x ratio - unprocessed - loss).
    pendingQaQty: integer("pending_qa_qty").default(0).notNull(),
  },
  (table) => [
    index("idx_sco_items_sco_id").on(table.scoId),
    index("idx_sco_items_raw_item_id").on(table.rawItemId),
    index("idx_sco_items_service_id").on(table.serviceId),
    index("idx_sco_items_finished_item_id").on(table.finishedItemId),
  ],
);

// BR-SCO-07..11, 25: job-work challan = one issue of material to the vendor.
// Number JWC/<FY>/<seq> (Rule 55: consecutive per FY, max 16 chars, never reused).
export const scoChallans = pgTable(
  "sco_challans",
  {
    id: serial("id").primaryKey(),
    challanNumber: text("challan_number").unique().notNull(),
    scoId: integer("sco_id")
      .references(() => subcontractingOrders.id)
      .notNull(),
    vendorId: integer("vendor_id")
      .references(() => supplierMaster.id)
      .notNull(),
    challanDate: timestamp("challan_date").notNull(),
    // BR-SCO-10: required for inter-state, unregistered vendor, or value >= Rs 50,000.
    ewayBillNo: text("eway_bill_no"),
    // Sum of line qty x unit issue cost, paise.
    valuePaise: bigint("value_paise", { mode: "number" }).notNull(),
    // BR-SCO-11: challan date + 1 year.
    returnDueDate: timestamp("return_due_date").notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    scoIdx: index("idx_sco_challans_sco").on(t.scoId),
    dueIdx: index("idx_sco_challans_due").on(t.returnDueDate),
    vendorIdx: index("idx_sco_challans_vendor").on(t.vendorId),
  }),
);

export const scoChallanLines = pgTable(
  "sco_challan_lines",
  {
    id: serial("id").primaryKey(),
    challanId: integer("challan_id")
      .references(() => scoChallans.id)
      .notNull(),
    scoItemId: integer("sco_item_id")
      .references(() => subcontractingOrderItems.id)
      .notNull(),
    // Raw item sent (copied from the SCO line, kept for traceability, BR-SCO-25).
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // Whole pieces > 0.
    qty: integer("qty").notNull(),
    // Item's average cost at issue time, paise per piece (BR-SCO-08).
    unitIssueCostPaise: bigint("unit_issue_cost_paise", {
      mode: "number",
    }).notNull(),
    heatNumber: text("heat_number"),
    // Raw item HSN at issue time (BR-SCO-09).
    hsnCode: text("hsn_code").notNull(),
    // Qty already settled by receipts (S3, FIFO); 0 <= settledQty <= qty.
    settledQty: integer("settled_qty").default(0).notNull(),
  },
  (t) => ({
    itemIdx: index("idx_sco_challan_lines_item_id").on(t.itemId),
    challanIdx: index("idx_sco_challan_lines_challan").on(t.challanId),
    scoItemIdx: index("idx_sco_challan_lines_sco_item").on(t.scoItemId),
  }),
);

export const grnStatusEnum = pgEnum("grn_status", [
  "draft",
  "pending_qa",
  "accepted",
  "rejected",
  "partial_accepted",
]);

// --- 4. GOODS RECEIVED NOTE (GRN) ---
export const grns = pgTable(
  "grns",
  {
    id: serial("id").primaryKey(),
    grnNumber: text("grn_number").unique().notNull(),
    poId: integer("po_id").references(() => purchaseOrders.id),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    status: grnStatusEnum("status").default("draft").notNull(),
    receivedDate: timestamp("received_date").defaultNow(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by").references(() => employees.id),
    // Header fields the delivery person actually fills in on arrival.
    // no-index: covered:uq_grns_supplier_challan supplier_id always given
    challanNo: text("challan_no"),
    challanDate: timestamp("challan_date"),
    vehicleNo: text("vehicle_no"),
    driverName: text("driver_name"),
    driverPhone: text("driver_phone"),
    remarks: text("remarks"),
  },
  (table) => ({
    statusIdIdx: index("idx_grns_status_id").on(table.status, table.id),
    // BR-GRN-05: same challan from the same supplier only once (deleted GRNs are gone).
    supplierChallanUq: uniqueIndex("uq_grns_supplier_challan").on(
      table.supplierId,
      table.challanNo,
    ),
    poIdIdx: index("idx_grns_po_id").on(table.poId),
    // GRN list `q` search (ilike %q%, #54)
    grnNumberTrgm: index("idx_grns_grn_number_trgm").using(
      "gin",
      table.grnNumber.op("gin_trgm_ops"),
    ),
  }),
);

// Add these to your existing `grnItems` table definition
export const grnItems = pgTable(
  "grn_items",
  {
    id: serial("id").primaryKey(),
    grnId: integer("grn_id").references(() => grns.id),
    poItemId: integer("po_item_id").references(() => purchaseOrderItems.id),

    // Quantities
    receivedQty: doublePrecision("received_qty").notNull(),
    acceptedQty: doublePrecision("accepted_qty").notNull(), // THIS updates the inventory ledger
    rejectedQty: doublePrecision("rejected_qty").default(0),

    // Standard QA
    qaStatus: text("qa_status").default("pending"), // 'pending', 'passed', 'failed', 'waived'

    // FAST-TRACK / BYPASS LOGIC
    isQaBypassed: boolean("is_qa_bypassed").default(false),
    qaBypassReason: text("qa_bypass_reason"), // Mandatory if bypassed
    // no-index: audit who-did-it column, read only by joining to employees
    qaBypassedBy: integer("qa_bypassed_by").references(() => employees.id),
    challanPhotoUrl: text("challan_photo_url"), // Proof of receipt
    qaBypassedAt: timestamp("qa_bypassed_at"),

    // Supplier heat / batch number (BR-GRN-21)
    batchNumber: text("batch_number"),

    // Over-receipt override (BR-GRN-15): stored when accepted past 105% of ordered
    overReceiptExcessQty: doublePrecision("over_receipt_excess_qty"),
    overReceiptReason: text("over_receipt_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    overReceiptBy: integer("over_receipt_by").references(() => employees.id),

    // Posted purchase returns only (BR-PRT-19, 38); caps read purchase_return_items.
    rejectedReturnedQty: qty3Col("rejected_returned_qty").default(0).notNull(),
    acceptedReturnedQty: qty3Col("accepted_returned_qty").default(0).notNull(),
  },
  (table) => ({
    grnIdIdx: index("idx_grn_items_grn_id").on(table.grnId),
    poItemIdIdx: index("idx_grn_items_po_item_id").on(table.poItemId),
    // "Awaiting return" (BR-PRT-39)
    awaitingReturnIdx: index("idx_grn_items_awaiting_return")
      .on(table.id)
      .where(sql`${table.rejectedQty} > 0`),
  }),
);

// Corrections on a posted GRN line (BR-GRN-29, 35). The line's acceptedQty is
// never edited; netAcceptedQty = acceptedQty - sum(qty).
export const grnCorrections = pgTable(
  "grn_corrections",
  {
    id: serial("id").primaryKey(),
    grnItemId: integer("grn_item_id")
      .references(() => grnItems.id)
      .notNull(),
    qty: doublePrecision("qty").notNull(), // > 0
    reason: text("reason").notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    grnItemIdx: index("idx_grn_corrections_grn_item_id").on(table.grnItemId),
  }),
);

export const qaTests = pgTable(
  "qa_tests",
  {
    id: serial("id").primaryKey(),
    grnItemId: integer("grn_item_id")
      .references(() => grnItems.id)
      .notNull(), // Link to GRN Item
    type: text("type").notNull(), // 'internal' or 'external'
    status: text("status").notNull(), // 'pending', 'passed', 'failed', 'waived'

    // External Lab Details
    externalLabName: text("external_lab_name"),
    testReportUrl: text("test_report_url"), // Link to S3/Cloudinary for PDF/Image

    // Internal/General Details
    // no-index: audit who-did-it column, read only by joining to employees
    testedBy: integer("tested_by").references(() => employees.id),
    testedAt: timestamp("tested_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_qa_tests_grn_item_id").on(table.grnItemId)],
);

// BR-SCO-12..17, 25: receipt = one delivery of processed goods back from the vendor.
// Number from the `sco_grn` counter. `status` reuses grn_status but only
// pending_qa / accepted / partial_accepted / rejected are used (never `draft`):
// pending_qa until every line is decided, then derived from the line decisions.
export const subcontractingGrns = pgTable(
  "subcontracting_grns",
  {
    id: serial("id").primaryKey(),
    grnNumber: text("grn_number").unique().notNull(),
    scoId: integer("sco_id")
      .references(() => subcontractingOrders.id)
      .notNull(),
    vendorId: integer("vendor_id")
      .references(() => supplierMaster.id)
      .notNull(),
    // BR-SCO-12: vendor's own challan / invoice number, unique per vendor (409).
    // no-index: covered:uq_sco_grns_vendor_challan vendor_id always given
    vendorChallanNo: text("vendor_challan_no").notNull(),
    status: grnStatusEnum("status").default("pending_qa").notNull(),
    receivedDate: timestamp("received_date").defaultNow().notNull(),
    notes: text("notes"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    vendorChallanUq: uniqueIndex("uq_sco_grns_vendor_challan").on(
      t.vendorId,
      t.vendorChallanNo,
    ),
    scoIdx: index("idx_sco_grns_sco").on(t.scoId),
  }),
);

export const subcontractingGrnItems = pgTable(
  "subcontracting_grn_items",
  {
    id: serial("id").primaryKey(),
    scoGrnId: integer("sco_grn_id")
      .references(() => subcontractingGrns.id)
      .notNull(),
    scoItemId: integer("sco_item_id")
      .references(() => subcontractingOrderItems.id)
      .notNull(),
    // BR-SCO-12: whole pieces of finished (processed) goods that came back, and raw
    // pieces that came back unprocessed (BR-SCO-16).
    processedQty: integer("processed_qty").notNull(),
    unprocessedQty: integer("unprocessed_qty").default(0).notNull(),
    // BR-SCO-13: null until the QA decision; accepted + rejected = processed.
    acceptedQty: integer("accepted_qty"),
    rejectedQty: integer("rejected_qty"),
    // pending_qa -> accepted | partial_accepted | rejected (one decision per line, 409 after).
    qaStatus: grnStatusEnum("qa_status").default("pending_qa").notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    qaDecidedBy: integer("qa_decided_by").references(() => employees.id),
    qaDecidedAt: timestamp("qa_decided_at"),
    qaNotes: text("qa_notes"),
    // Heat number of the settled challan line(s) (BR-SCO-25); first settled line's heat.
    heatNumber: text("heat_number"),
  },
  (t) => ({
    receiptIdx: index("idx_sco_grn_items_receipt").on(t.scoGrnId),
    scoItemIdx: index("idx_sco_grn_items_sco_item").on(t.scoItemId),
  }),
);

// BR-SCO-17: which challan lines a receipt line settled, and how many raw pieces.
export const scoReceiptSettlements = pgTable(
  "sco_receipt_settlements",
  {
    id: serial("id").primaryKey(),
    receiptItemId: integer("receipt_item_id")
      .references(() => subcontractingGrnItems.id)
      .notNull(),
    challanLineId: integer("challan_line_id")
      .references(() => scoChallanLines.id)
      .notNull(),
    // Raw pieces settled against that challan line, > 0.
    qty: integer("qty").notNull(),
    // Part of qty drawn by processed pieces (the rest is unprocessed); QA costs from this part only (BR-SCO-14).
    processedQty: integer("processed_qty").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    pairUq: uniqueIndex("uq_sco_settlement_receipt_challan_line").on(
      t.receiptItemId,
      t.challanLineId,
    ),
    challanLineIdx: index("idx_sco_settlements_challan_line").on(
      t.challanLineId,
    ),
  }),
);

// --- PURCHASE RETURNS (BR-PRT, docs/specs/purchase-returns/design/data.md) ---
export const purchaseReturnStatusEnum = pgEnum("purchase_return_status", [
  "draft",
  "posted",
  "cancelled",
]);
export const purchaseReturnSourceEnum = pgEnum("purchase_return_source", [
  "rejected",
  "accepted",
]);
export const debitNoteStatusEnum = pgEnum("debit_note_status", [
  "issued",
  "cancelled",
]);
export const purchaseReturnEventActionEnum = pgEnum(
  "purchase_return_event_action",
  ["create", "edit", "post", "cancel_draft", "cancel_posted"],
);

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: serial("id").primaryKey(),
    // PRT-<YYYY-MM>-<seq 4>, counter doc_type `purchase_return`, IST month (BR-PRT-23)
    proNumber: text("pro_number").unique().notNull(),
    grnId: integer("grn_id")
      .references(() => grns.id)
      .notNull(),
    poId: integer("po_id")
      .references(() => purchaseOrders.id)
      .notNull(),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    status: purchaseReturnStatusEnum("status").default("draft").notNull(),
    reason: text("reason").notNull(),
    vendorReturnRef: text("vendor_return_ref"),
    transporter: text("transporter"),
    vehicleNo: text("vehicle_no"),
    remarks: text("remarks"),
    // PRC/<yy>-<yy+1>/<seq 4>, allocated at post (BR-PRT-35); null in draft
    challanNumber: text("challan_number").unique(),
    replacementExpected: boolean("replacement_expected")
      .default(false)
      .notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    postedBy: integer("posted_by").references(() => employees.id),
    postedAt: timestamp("posted_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by")
      .references(() => employees.id)
      .notNull(),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_purchase_returns_po_id").on(table.poId),
    index("idx_purchase_returns_supplier_id").on(table.supplierId),
    index("idx_purchase_returns_grn_id").on(table.grnId),
    index("idx_purchase_returns_status_id").on(table.status, table.id.desc()),
    index("idx_purchase_returns_created_at_id").on(
      table.createdAt.desc(),
      table.id,
    ),
    index("idx_purchase_returns_pro_number_trgm").using(
      "gin",
      table.proNumber.op("gin_trgm_ops"),
    ),
  ],
);

export const purchaseReturnItems = pgTable(
  "purchase_return_items",
  {
    id: serial("id").primaryKey(),
    proId: integer("pro_id")
      .references(() => purchaseReturns.id)
      .notNull(),
    grnItemId: integer("grn_item_id")
      .references(() => grnItems.id)
      .notNull(),
    poItemId: integer("po_item_id")
      .references(() => purchaseOrderItems.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    source: purchaseReturnSourceEnum("source").notNull(),
    returnQty: qty3Col("return_qty").notNull(),
    uom: text("uom").notNull(),
    batchNumber: text("batch_number"),
    // server-set from the PO line (BR-PRT-09)
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull(),
    gstPercent: numeric("gst_percent", {
      precision: 5,
      scale: 2,
      mode: "number",
    }).notNull(),
    // set at post (BR-PRT-31..34)
    hsnCode: text("hsn_code"),
    taxablePaise: bigint("taxable_paise", { mode: "number" }),
    gstPaise: bigint("gst_paise", { mode: "number" }),
    cgstPaise: bigint("cgst_paise", { mode: "number" }),
    sgstPaise: bigint("sgst_paise", { mode: "number" }),
    igstPaise: bigint("igst_paise", { mode: "number" }),
    locationId: integer("location_id").references(() => locations.id),
    unitCostPaise: bigint("unit_cost_paise", { mode: "number" }),
    // no-index: pk-join ledger row read by id; the ledger points back by reference
    ledgerId: integer("ledger_id"),
    cancelLedgerId: integer("cancel_ledger_id"),
  },
  (table) => [
    index("idx_purchase_return_items_pro_id").on(table.proId),
    // BR-PRT-03: one line + source once per return
    uniqueIndex("uq_purchase_return_items_pro_grn_item_source").on(
      table.proId,
      table.grnItemId,
      table.source,
    ),
    // cap sums per GRN line (BR-PRT-05/06/07/42)
    index("idx_purchase_return_items_grn_item_source").on(
      table.grnItemId,
      table.source,
    ),
    index("idx_purchase_return_items_po_item_id").on(table.poItemId),
    index("idx_purchase_return_items_item_id").on(table.itemId),
    index("idx_purchase_return_items_location_id").on(table.locationId),
  ],
);

export const purchaseDebitNotes = pgTable(
  "purchase_debit_notes",
  {
    id: serial("id").primaryKey(),
    // DN/<yy>-<yy+1>/<seq>, doc_type `debit_note` (BR-PRT-30)
    dnNumber: text("dn_number").unique().notNull(),
    proId: integer("pro_id")
      .references(() => purchaseReturns.id)
      .notNull()
      .unique(),
    debitNoteDate: timestamp("debit_note_date").notNull(),
    status: debitNoteStatusEnum("status").default("issued").notNull(),
    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    isInterstate: boolean("is_interstate").notNull(),
    // BR-PRT-33, 44: oldest approved bill covering the returned lines, or null
    supplierInvoiceId: integer("supplier_invoice_id").references(
      () => supplierInvoices.id,
    ),
    billOffsetPaise: bigint("bill_offset_paise", { mode: "number" })
      .default(0)
      .notNull(),
    // snapshots copied at post (BR-PRT-33, 34)
    plantName: text("plant_name").notNull(),
    plantAddress: text("plant_address").notNull(),
    plantGstin: text("plant_gstin").notNull(),
    plantStateCode: text("plant_state_code").notNull(),
    supplierName: text("supplier_name").notNull(),
    supplierAddress: text("supplier_address"),
    supplierGstin: text("supplier_gstin"),
    // no-index: audit who-did-it columns, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => [
    index("idx_purchase_debit_notes_supplier_invoice_id").on(
      table.supplierInvoiceId,
    ),
  ],
);

// Append-only history (BR-PRT-41): rows are never edited or deleted.
export const purchaseReturnEvents = pgTable(
  "purchase_return_events",
  {
    id: serial("id").primaryKey(),
    proId: integer("pro_id")
      .references(() => purchaseReturns.id)
      .notNull(),
    action: purchaseReturnEventActionEnum("action").notNull(),
    fromStatus: purchaseReturnStatusEnum("from_status"),
    toStatus: purchaseReturnStatusEnum("to_status").notNull(),
    reason: text("reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    actorId: integer("actor_id")
      .references(() => employees.id)
      .notNull(),
    at: timestamp("at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_purchase_return_events_pro_id_id").on(table.proId, table.id),
  ],
);

// --- 5. SUPPLIER INVOICE & 3-WAY MATCH ---
export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: serial("id").primaryKey(),
    // no-index: covered:uq_supplier_invoice_number supplier_id always given
    invoiceNumber: text("invoice_number").notNull(), //supplier invoice number
    invoiceDate: timestamp("invoice_date").notNull(),
    poId: integer("po_id").references(() => purchaseOrders.id),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    billedAmountPaise: bigint("billed_amount_paise", {
      mode: "number",
    }).notNull(),
    // 3-way match status
    matchStatus: text("match_status").default("pending"), // 'matched', 'exception', 'approved'
    paymentStatus: text("payment_status").default("unpaid"), // 'unpaid', 'scheduled', 'paid'
    dueDate: timestamp("due_date"), // Calculated: GRN Date + paymentTermsDays
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    poIdIdx: index("idx_supplier_invoices_po_id").on(table.poId),
    // BR-PO-15: the same invoice number from the same supplier is refused.
    supplierInvoiceNumberUq: uniqueIndex("uq_supplier_invoice_number").on(
      table.supplierId,
      table.invoiceNumber,
    ),
  }),
);

export const supplierBankDetails = pgTable(
  "supplier_bank_details",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    accountName: text("account_name").notNull(),
    accountNumber: text("account_number").notNull(),
    ifscCode: text("ifsc_code").notNull(),
    bankName: text("bank_name").notNull(),
    branchName: text("branch_name"),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (table) => [
    index("idx_supplier_bank_details_supplier_id").on(table.supplierId),
  ],
);

// --- GAP 3: SUPPLIER PAYMENTS ---
export const supplierPayments = pgTable(
  "supplier_payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id")
      .references(() => supplierInvoices.id)
      .notNull(),
    amountPaidPaise: bigint("amount_paid_paise", { mode: "number" }).notNull(),
    paymentDate: timestamp("payment_date").notNull(),
    paymentMethod: text("payment_method").notNull(), // 'NEFT', 'RTGS', 'UPI', 'Cheque'
    transactionRef: text("transaction_ref"), // UTR Number or Cheque Number
    notes: text("notes"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_supplier_payments_invoice_id").on(table.invoiceId)],
);
