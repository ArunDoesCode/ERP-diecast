import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { itemMaster, serviceMaster } from "./02_procurement-catalog";
import { supplierMaster } from "./02_procurement-suppliers";
import { employees } from "./03_hcm";

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
    type: prTypeEnum("type").notNull(),
    saleOrderId: integer("sale_order_id"), // Null if stock_reorder or someother option
    assetId: integer("asset_id"), // Only populated if type is 'maintenance' or 'tooling' (Optional: link to a specific machine/die)
    status: prStatusEnum("status").default("draft").notNull(),
    requestedBy: integer("requested_by")
      .references(() => employees.id)
      .notNull(),
    approvedBy: integer("approved_by").references(() => employees.id),
    currentApprovalLevel: integer("current_approval_level")
      .default(0)
      .notNull(),
    totalApprovalLevels: integer("total_approval_levels").default(0).notNull(),
    notes: text("notes"),
    estimatedAmountPaise: integer("estimated_amount_paise")
      .default(0)
      .notNull(),
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    statusIdx: index("idx_purchase_requests_status").on(table.status),
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
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
  },
  (table) => ({
    prIdIdx: index("idx_pr_items_pr_id").on(table.prId),
    statusIdx: index("idx_pr_items_status").on(table.status),
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
    subtotalPaise: integer("subtotal_paise").default(0).notNull(),
    taxAmountPaise: integer("tax_amount_paise").default(0).notNull(),
    totalAmountPaise: integer("total_amount_paise").default(0).notNull(),
    // Terms
    paymentTermsDays: integer("payment_terms_days").default(0), // e.g., 30 for Net 30
    deliveryTerms: text("delivery_terms"),
    notes: text("notes"),
    expectedDeliveryDate: timestamp("expected_delivery_date"),
    approvedBy: integer("approved_by").references(() => employees.id),
    currentApprovalLevel: integer("current_approval_level")
      .default(0)
      .notNull(),
    totalApprovalLevels: integer("total_approval_levels").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
    confirmedBy: integer("confirmed_by").references(() => employees.id),
    confirmationNote: text("confirmation_note"),
    // Terminal close audit trail — set when a PO transitions to `closed`
    // (legal from `fully_received` or `invoiced`).
    closedAt: timestamp("closed_at"),
    closedBy: integer("closed_by").references(() => employees.id),
    closeNote: text("close_note"),
    // Cancel audit trail (BR-PO-11, 21): who, when, why.
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    // BR-PO-13: closed from partial_received with open qty dropped.
    shortClosed: boolean("short_closed").default(false).notNull(),
    // BR-PO-15, 21: who recorded the supplier invoice, and when.
    invoicedBy: integer("invoiced_by").references(() => employees.id),
    invoicedAt: timestamp("invoiced_at"),
  },
  (table) => ({
    statusIdx: index("idx_purchase_orders_status").on(table.status),
    supplierIdx: index("idx_purchase_orders_supplier_id").on(table.supplierId),
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
    unitPricePaise: integer("unit_price_paise").notNull(),
    uom: text("uom").notNull(),
    // BR-PO-04: GST % per line (allowed set BR-SUP-13) and the paise maths,
    // stored so the header totals and approval matching never re-derive them.
    gstPercent: doublePrecision("gst_percent").default(0).notNull(),
    lineValuePaise: integer("line_value_paise").default(0).notNull(),
    lineTaxPaise: integer("line_tax_paise").default(0).notNull(),
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

export const subcontractingOrders = pgTable("subcontracting_orders", {
  id: serial("id").primaryKey(),
  scoNumber: text("sco_number").unique().notNull(),
  vendorId: integer("vendor_id")
    .references(() => supplierMaster.id)
    .notNull(),
  status: scoStatusEnum("status").default("draft").notNull(),

  // Link to the internal Job Order or Project this service is for (for cost accounting)
  projectRef: text("project_ref"),

  notes: text("notes"),
  // BR-SCO-03: required, today .. today + 365 days (checked by the API).
  expectedReturnDate: timestamp("expected_return_date").notNull(),
  // BR-SCO-04: money in paise. subtotal = sum(service price x return qty), no GST.
  subtotalPaise: integer("subtotal_paise").default(0).notNull(),
  taxAmountPaise: integer("tax_amount_paise").default(0).notNull(),
  totalAmountPaise: integer("total_amount_paise").default(0).notNull(),
  // Approval mirror, same as PR/PO (BR-SCO-06).
  approvedBy: integer("approved_by").references(() => employees.id),
  currentApprovalLevel: integer("current_approval_level").default(0).notNull(),
  totalApprovalLevels: integer("total_approval_levels").default(0).notNull(),
  // Kept nullable (older rows); the API always sets it and checks it on submit (BR-SCO-06).
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  // BR-SCO-20: cancel who, when, why.
  cancelledBy: integer("cancelled_by").references(() => employees.id),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),
  // BR-SCO-19: close who, when, why (reason only when a loss is written off).
  closedBy: integer("closed_by").references(() => employees.id),
  closedAt: timestamp("closed_at"),
  closeReason: text("close_reason"),
});

export const subcontractingOrderItems = pgTable("subcontracting_order_items", {
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
  serviceUnitPricePaise: integer("service_unit_price_paise").notNull(),
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
});

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
    createdBy: integer("created_by").references(() => employees.id),
    // Header fields the delivery person actually fills in on arrival.
    challanNo: text("challan_no"),
    challanDate: timestamp("challan_date"),
    vehicleNo: text("vehicle_no"),
    driverName: text("driver_name"),
    driverPhone: text("driver_phone"),
    remarks: text("remarks"),
  },
  (table) => ({
    // BR-GRN-05: same challan from the same supplier only once (deleted GRNs are gone).
    supplierChallanUq: uniqueIndex("uq_grns_supplier_challan").on(
      table.supplierId,
      table.challanNo,
    ),
    poIdIdx: index("idx_grns_po_id").on(table.poId),
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
    qaBypassedBy: integer("qa_bypassed_by").references(() => employees.id),
    challanPhotoUrl: text("challan_photo_url"), // Proof of receipt
    qaBypassedAt: timestamp("qa_bypassed_at"),

    // Supplier heat / batch number (BR-GRN-21)
    batchNumber: text("batch_number"),

    // Over-receipt override (BR-GRN-15): stored when accepted past 105% of ordered
    overReceiptExcessQty: doublePrecision("over_receipt_excess_qty"),
    overReceiptReason: text("over_receipt_reason"),
    overReceiptBy: integer("over_receipt_by").references(() => employees.id),
  },
  (table) => ({
    grnIdIdx: index("idx_grn_items_grn_id").on(table.grnId),
    poItemIdIdx: index("idx_grn_items_po_item_id").on(table.poItemId),
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
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    grnItemIdx: index("idx_grn_corrections_grn_item_id").on(table.grnItemId),
  }),
);

export const qaTests = pgTable("qa_tests", {
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
  testedBy: integer("tested_by").references(() => employees.id),
  testedAt: timestamp("tested_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subcontractingGrns = pgTable("subcontracting_grns", {
  id: serial("id").primaryKey(),
  grnNumber: text("grn_number").unique().notNull(), // Can use a prefix like SCO-GRN-001
  scoId: integer("sco_id")
    .references(() => subcontractingOrders.id)
    .notNull(),
  vendorId: integer("vendor_id")
    .references(() => supplierMaster.id)
    .notNull(),
  status: grnStatusEnum("status").default("draft").notNull(),
  receivedDate: timestamp("received_date").defaultNow(),
  createdBy: integer("created_by").references(() => employees.id),
});

export const subcontractingGrnItems = pgTable("subcontracting_grn_items", {
  id: serial("id").primaryKey(),
  scoGrnId: integer("sco_grn_id")
    .references(() => subcontractingGrns.id)
    .notNull(),
  scoItemId: integer("sco_item_id")
    .references(() => subcontractingOrderItems.id)
    .notNull(),
  receivedQty: doublePrecision("received_qty").notNull(),
  acceptedQty: doublePrecision("accepted_qty").notNull(), // Triggers sco_receipt in ledger
  rejectedQty: doublePrecision("rejected_qty").default(0),
  qaStatus: text("qa_status").default("pending"),
  isQaBypassed: boolean("is_qa_bypassed").default(false),
  qaBypassReason: text("qa_bypass_reason"),
});

// --- GAP 2: PURCHASE RETURN ORDERS (PRO) ---
export const purchaseReturns = pgTable("purchase_returns", {
  id: serial("id").primaryKey(),
  proNumber: text("pro_number").unique().notNull(),
  poId: integer("po_id")
    .references(() => purchaseOrders.id)
    .notNull(),
  supplierId: integer("supplier_id")
    .references(() => supplierMaster.id)
    .notNull(),
  status: text("status").default("draft").notNull(), // draft, dispatched, closed
  reason: text("reason").notNull(),
  debitNoteAmountPaise: integer("debit_note_amount_paise").default(0).notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: serial("id").primaryKey(),
  proId: integer("pro_id")
    .references(() => purchaseReturns.id)
    .notNull(),
  itemId: integer("item_id")
    .references(() => itemMaster.id)
    .notNull(),
  returnQty: doublePrecision("return_qty").notNull(),
  unitPricePaise: integer("unit_price_paise").notNull(),
});

// --- 5. SUPPLIER INVOICE & 3-WAY MATCH ---
export const supplierInvoices = pgTable(
  "supplier_invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull(), //supplier invoice number
    invoiceDate: timestamp("invoice_date").notNull(),
    poId: integer("po_id").references(() => purchaseOrders.id),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    billedAmountPaise: integer("billed_amount_paise").notNull(),
    // 3-way match status
    matchStatus: text("match_status").default("pending"), // 'matched', 'exception', 'approved'
    paymentStatus: text("payment_status").default("unpaid"), // 'unpaid', 'scheduled', 'paid'
    dueDate: timestamp("due_date"), // Calculated: GRN Date + paymentTermsDays
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // BR-PO-15: the same invoice number from the same supplier is refused.
    supplierInvoiceNumberUq: uniqueIndex("uq_supplier_invoice_number").on(
      table.supplierId,
      table.invoiceNumber,
    ),
  }),
);

export const supplierBankDetails = pgTable("supplier_bank_details", {
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
});

// --- GAP 3: SUPPLIER PAYMENTS ---
export const supplierPayments = pgTable("supplier_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .references(() => supplierInvoices.id)
    .notNull(),
  amountPaidPaise: integer("amount_paid_paise").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentMethod: text("payment_method").notNull(), // 'NEFT', 'RTGS', 'UPI', 'Cheque'
  transactionRef: text("transaction_ref"), // UTR Number or Cheque Number
  notes: text("notes"),
  createdBy: integer("created_by")
    .references(() => employees.id)
    .notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
