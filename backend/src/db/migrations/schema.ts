import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const dieStatus = pgEnum("die_status", [
  "active",
  "retired",
  "in_design",
]);
export const inspectionType = pgEnum("inspection_type", [
  "inward",
  "in_process",
  "trial",
  "final",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
]);
export const jobStatus = pgEnum("job_status", [
  "enquiry",
  "quoted",
  "order_received",
  "in_production",
  "dispatched",
  "invoiced",
  "complete",
]);
export const machineStatus = pgEnum("machine_status", [
  "idle",
  "running",
  "maintenance",
  "breakdown",
]);
export const poStatus = pgEnum("po_status", [
  "draft",
  "pending_approval",
  "approved",
  "partial",
  "rejected",
  "cancelled",
]);
export const prStatus = pgEnum("pr_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "ordered",
  "cancelled",
]);
export const stepStatus = pgEnum("step_status", [
  "pending",
  "active",
  "done",
  "blocked",
  "rework",
]);
export const grnStatus = pgEnum("grn_status", [
  "draft",
  "pending_qa",
  "accepted",
  "rejected",
  "partial_accepted",
]);
export const inventoryRefType = pgEnum("inventory_ref_type", [
  "grn",
  "grn_bypass",
  "pro",
  "sco_issue",
  "sco_receipt",
  "job_order_issue",
  "scrap_dispatch",
  "stock_adjustment",
]);
export const inventoryTxType = pgEnum("inventory_tx_type", [
  "in",
  "out",
  "adjustment",
]);
export const locationType = pgEnum("location_type", [
  "main_store",
  "vendor_premise",
  "finished_goods",
  "scrap_yard",
]);
export const prType = pgEnum("pr_type", [
  "project",
  "stock_reorder",
  "maintenance",
  "tooling",
  "subcontracting",
  "misc",
]);
export const scoStatus = pgEnum("sco_status", [
  "draft",
  "approved",
  "material_issued",
  "material_received",
  "closed",
  "cancelled",
]);
export const supplierType = pgEnum("supplier_type", [
  "raw_material",
  "consumables",
  "service_provider",
  "trader",
  "both",
]);

export const employees = pgTable(
  "employees",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    email: text(),
    passwordHash: text("password_hash"),
    phone: text(),
    qrToken: text("qr_token"),
    roleId: integer("role_id")
      .notNull()
      .references((): AnyPgColumn => roles.id),
    dailyRatePaise: integer("daily_rate_paise").default(0),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
    lastUpdatedBy: integer("last_updated_by"),
    lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [table.id],
      name: "employees_created_by_employees_id_fkey",
    }),
    foreignKey({
      columns: [table.lastUpdatedBy],
      foreignColumns: [table.id],
      name: "employees_last_updated_by_employees_id_fkey",
    }),
    unique("employees_email_key").on(table.email),
    unique("employees_qr_token_key").on(table.qrToken),
  ],
);

export const enquiries = pgTable("enquiries", {
  id: serial().primaryKey(),
  customerId: integer("customer_id").notNull(),
  description: text(),
  filesJson: jsonb("files_json").default([]),
  status: text().default("open").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const expenses = pgTable("expenses", {
  id: serial().primaryKey(),
  category: text().notNull(),
  amountPaise: integer("amount_paise").notNull(),
  paidBy: integer("paid_by"),
  notes: text(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const grn = pgTable("grn", {
  id: serial().primaryKey(),
  poId: integer("po_id").references(() => purchaseOrders.id),
  receivedAt: timestamp("received_at").default(sql`now()`).notNull(),
  notes: text(),
  receivedBy: integer("received_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const grnItems = pgTable("grn_items", {
  id: serial().primaryKey(),
  grnId: integer("grn_id").notNull(),
  itemName: text("item_name").notNull(),
  qty: numeric().notNull(),
  uom: text().notNull(),
  unitCostPaise: integer("unit_cost_paise").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const grns = pgTable(
  "grns",
  {
    id: serial().primaryKey(),
    grnNumber: text("grn_number").notNull(),
    poId: integer("po_id"),
    supplierId: integer("supplier_id").notNull(),
    status: grnStatus().default("draft").notNull(),
    receivedDate: timestamp("received_date").default(sql`now()`),
    createdBy: integer("created_by"),
  },
  (table) => [unique("grns_grn_number_key").on(table.grnNumber)],
);

export const inventory = pgTable(
  "inventory",
  {
    id: serial().primaryKey(),
    itemName: text("item_name").notNull(),
    uom: text().notNull(),
    qtyOnHand: numeric("qty_on_hand", { mode: "number" }).default(0).notNull(),
    reorderLevel: numeric("reorder_level", { mode: "number" })
      .default(0)
      .notNull(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
    lastUpdatedBy: integer("last_updated_by"),
    lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
  },
  (table) => [unique("inventory_item_name_key").on(table.itemName)],
);

export const inventoryLedger = pgTable("inventory_ledger", {
  id: serial().primaryKey(),
  itemId: integer("item_id").notNull(),
  locationId: integer("location_id").notNull(),
  batchNumber: text("batch_number"),
  transactionType: inventoryTxType("transaction_type").notNull(),
  referenceType: inventoryRefType("reference_type").notNull(),
  referenceId: integer("reference_id").notNull(),
  quantityChange: doublePrecision("quantity_change").notNull(),
  balanceAfter: doublePrecision("balance_after").notNull(),
  unitCostPaise: integer("unit_cost_paise").notNull(),
  totalValueChangePaise: integer("total_value_change_paise").notNull(),
  notes: text(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const itemMaster = pgTable(
  "item_master",
  {
    id: serial().primaryKey(),
    sku: text().notNull(),
    name: text().notNull(),
    description: text(),
    category: text().notNull(),
    uom: text().notNull(),
    reorderLevel: doublePrecision("reorder_level").default(0).notNull(),
    currentStock: doublePrecision("current_stock").default(0).notNull(),
    averageCostPaise: integer("average_cost_paise").default(0),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (table) => [unique("item_master_sku_key").on(table.sku)],
);

export const jobSteps = pgTable("job_steps", {
  id: serial().primaryKey(),
  jobId: integer("job_id").notNull(),
  stepNumber: integer("step_number").notNull(),
  stepName: text("step_name").notNull(),
  status: stepStatus().default("pending").notNull(),
  assignedTo: integer("assigned_to"),
  machineId: integer("machine_id"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  actualQty: integer("actual_qty"),
  notes: text(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial().primaryKey(),
  salesOrderId: integer("sales_order_id"),
  dieId: integer("die_id"),
  targetQty: integer("target_qty").notNull(),
  status: jobStatus().default("in_production").notNull(),
  notes: text(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const locations = pgTable("locations", {
  id: serial().primaryKey(),
  name: text().notNull(),
  type: locationType().notNull(),
  isVirtual: boolean("is_virtual").default(false).notNull(),
  linkedVendorId: integer("linked_vendor_id"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const machineLogs = pgTable("machine_logs", {
  id: serial().primaryKey(),
  machineId: integer("machine_id").notNull(),
  eventType: text("event_type").notNull(),
  notes: text(),
  recordedBy: integer("recorded_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const machines = pgTable("machines", {
  id: serial().primaryKey(),
  name: text().notNull(),
  type: text(),
  status: machineStatus().default("idle").notNull(),
  lastMaintenanceAt: timestamp("last_maintenance_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const modules = pgTable(
  "modules",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
  },
  (table) => [unique("modules_name_key").on(table.name)],
);

export const pages = pgTable(
  "pages",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    label: text().notNull(),
    path: text().notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
    moduleId: integer("module_id").references(() => modules.id),
  },
  (table) => [unique("pages_key_key").on(table.key)],
);

export const payrollItems = pgTable("payroll_items", {
  id: serial().primaryKey(),
  payrollRunId: integer("payroll_run_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  daysPresent: integer("days_present").default(0).notNull(),
  dailyRatePaise: integer("daily_rate_paise").notNull(),
  grossPaise: integer("gross_paise").notNull(),
  deductionsPaise: integer("deductions_paise").default(0).notNull(),
  netPaise: integer("net_paise").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: serial().primaryKey(),
  month: integer().notNull(),
  year: integer().notNull(),
  totalPaise: integer("total_paise").default(0).notNull(),
  status: integer().default(0).notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const prPoItemLinks = pgTable("pr_po_item_links", {
  id: serial().primaryKey(),
  prItemId: integer("pr_item_id"),
  poItemId: integer("po_item_id"),
  linkedQty: doublePrecision("linked_qty").notNull(),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: serial().primaryKey(),
  poId: integer("po_id"),
  itemId: integer("item_id").notNull(),
  qty: doublePrecision().notNull(),
  receivedQty: doublePrecision("received_qty").default(0),
  unitPricePaise: integer("unit_price_paise").notNull(),
  uom: text().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial().primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  totalPaise: integer("total_paise").notNull(),
  status: poStatus().default("draft").notNull(),
  expectedDate: timestamp("expected_date"),
  notes: text(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const purchaseRequestItems = pgTable("purchase_request_items", {
  id: serial().primaryKey(),
  prId: integer("pr_id"),
  itemId: integer("item_id"),
  requestedQty: doublePrecision("requested_qty").notNull(),
  issuedQty: doublePrecision("issued_qty").default(0),
  uom: text().notNull(),
  expectedDate: timestamp("expected_date"),
});

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: serial().primaryKey(),
    prNumber: text("pr_number").notNull(),
    type: prType().notNull(),
    saleOrderId: integer("sale_order_id"),
    assetId: integer("asset_id"),
    status: prStatus().default("draft").notNull(),
    requestedBy: integer("requested_by"),
    approvedBy: integer("approved_by"),
    notes: text(),
    createdAt: timestamp("created_at").default(sql`now()`),
    updatedAt: timestamp("updated_at").default(sql`now()`),
  },
  (table) => [unique("purchase_requests_pr_number_key").on(table.prNumber)],
);

export const purchaseRequisitionItems = pgTable("purchase_requisition_items", {
  id: serial().primaryKey(),
  prId: integer("pr_id").notNull(),
  inventoryId: integer("inventory_id"),
  itemName: text("item_name").notNull(),
  qty: numeric().notNull(),
  uom: text().notNull(),
  remarks: text(),
  poItemId: integer("po_item_id"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const purchaseRequisitions = pgTable("purchase_requisitions", {
  id: serial().primaryKey(),
  status: prStatus().default("draft").notNull(),
  requestedBy: integer("requested_by").notNull(),
  approvedBy: integer("approved_by"),
  approvedAt: timestamp("approved_at"),
  notes: text(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const purchaseReturnItems = pgTable("purchase_return_items", {
  id: serial().primaryKey(),
  proId: integer("pro_id").notNull(),
  itemId: integer("item_id").notNull(),
  returnQty: doublePrecision("return_qty").notNull(),
  unitPricePaise: integer("unit_price_paise").notNull(),
});

export const purchaseReturns = pgTable(
  "purchase_returns",
  {
    id: serial().primaryKey(),
    proNumber: text("pro_number").notNull(),
    poId: integer("po_id").notNull(),
    supplierId: integer("supplier_id").notNull(),
    status: text().default("draft").notNull(),
    reason: text().notNull(),
    debitNoteAmountPaise: integer("debit_note_amount_paise")
      .default(0)
      .notNull(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (table) => [unique("purchase_returns_pro_number_key").on(table.proNumber)],
);

export const qaLogs = pgTable("qa_logs", {
  id: serial().primaryKey(),
  jobStepId: integer("job_step_id").notNull(),
  inspectionType: inspectionType("inspection_type").notNull(),
  trialNumber: integer("trial_number"),
  passQty: integer("pass_qty").default(0).notNull(),
  failQty: integer("fail_qty").default(0).notNull(),
  defectNotes: text("defect_notes"),
  photosJson: jsonb("photos_json").default([]),
  inspectorId: integer("inspector_id").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const qaTests = pgTable("qa_tests", {
  id: serial().primaryKey(),
  grnItemId: integer("grn_item_id").notNull(),
  type: text().notNull(),
  status: text().notNull(),
  externalLabName: text("external_lab_name"),
  testReportUrl: text("test_report_url"),
  testedBy: integer("tested_by"),
  testedAt: timestamp("tested_at"),
  notes: text(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const quotations = pgTable("quotations", {
  id: serial().primaryKey(),
  enquiryId: integer("enquiry_id").notNull(),
  version: integer().default(1).notNull(),
  amountPaise: integer("amount_paise").notNull(),
  deliveryDate: timestamp("delivery_date"),
  status: text().default("draft").notNull(),
  notes: text(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: serial().primaryKey(),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (table) => [unique("refresh_tokens_token_hash_key").on(table.tokenHash)],
);

export const rolePages = pgTable(
  "role_pages",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    id: serial().primaryKey(),
  },
  (table) => [
    unique("role_pages_role_id_page_id_unique").on(table.roleId, table.pageId),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    isSystem: boolean("is_system").default(false).notNull(),
    createdBy: integer("created_by").references(
      (): AnyPgColumn => employees.id,
    ),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (table) => [unique("roles_name_key").on(table.name)],
);

export const salesOrders = pgTable("sales_orders", {
  id: serial().primaryKey(),
  quotationId: integer("quotation_id"),
  customerId: integer("customer_id").notNull(),
  totalPaise: integer("total_paise").notNull(),
  status: text().default("confirmed").notNull(),
  notes: text(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const spareParts = pgTable("spare_parts", {
  id: serial().primaryKey(),
  machineId: integer("machine_id"),
  partName: text("part_name").notNull(),
  qtyOnHand: integer("qty_on_hand").default(0).notNull(),
  reorderLevel: integer("reorder_level").default(0).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const subcontractingGrnItems = pgTable("subcontracting_grn_items", {
  id: serial().primaryKey(),
  scoGrnId: integer("sco_grn_id").notNull(),
  scoItemId: integer("sco_item_id").notNull(),
  receivedQty: doublePrecision("received_qty").notNull(),
  acceptedQty: doublePrecision("accepted_qty").notNull(),
  rejectedQty: doublePrecision("rejected_qty").default(0),
  qaStatus: text("qa_status").default("pending"),
  isQaBypassed: boolean("is_qa_bypassed").default(false),
  qaBypassReason: text("qa_bypass_reason"),
});

export const subcontractingGrns = pgTable(
  "subcontracting_grns",
  {
    id: serial().primaryKey(),
    grnNumber: text("grn_number").notNull(),
    scoId: integer("sco_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    status: grnStatus().default("draft").notNull(),
    receivedDate: timestamp("received_date").default(sql`now()`),
    createdBy: integer("created_by"),
  },
  (table) => [unique("subcontracting_grns_grn_number_key").on(table.grnNumber)],
);

export const subcontractingOrderItems = pgTable("subcontracting_order_items", {
  id: serial().primaryKey(),
  scoId: integer("sco_id").notNull(),
  rawItemId: integer("raw_item_id").notNull(),
  rawItemBatch: text("raw_item_batch"),
  rawQtyToIssue: doublePrecision("raw_qty_to_issue").notNull(),
  serviceDescription: text("service_description").notNull(),
  serviceHsnSacCode: text("service_hsn_sac_code"),
  serviceUnitPricePaise: integer("service_unit_price_paise").notNull(),
  serviceTaxPercentage: doublePrecision("service_tax_percentage")
    .default(18)
    .notNull(),
  finishedItemId: integer("finished_item_id").notNull(),
  expectedReturnQty: doublePrecision("expected_return_qty").notNull(),
});

export const subcontractingOrders = pgTable(
  "subcontracting_orders",
  {
    id: serial().primaryKey(),
    scoNumber: text("sco_number").notNull(),
    vendorId: integer("vendor_id").notNull(),
    status: scoStatus().default("draft").notNull(),
    projectRef: text("project_ref"),
    notes: text(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (table) => [
    unique("subcontracting_orders_sco_number_key").on(table.scoNumber),
  ],
);

export const supplierBankDetails = pgTable("supplier_bank_details", {
  id: serial().primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  ifscCode: text("ifsc_code").notNull(),
  bankName: text("bank_name").notNull(),
  branchName: text("branch_name"),
  isDefault: boolean("is_default").default(false).notNull(),
});

export const supplierInvoices = pgTable("supplier_invoices", {
  id: serial().primaryKey(),
  invoiceNumber: text("invoice_number").notNull(),
  invoiceDate: timestamp("invoice_date").notNull(),
  poId: integer("po_id"),
  supplierId: integer("supplier_id").notNull(),
  billedAmountPaise: integer("billed_amount_paise").notNull(),
  matchStatus: text("match_status").default("pending"),
  paymentStatus: text("payment_status").default("unpaid"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").default(sql`now()`),
});

export const supplierItems = pgTable("supplier_items", {
  id: serial().primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  itemId: integer("item_id").notNull(),
  supplierSku: text("supplier_sku"),
  supplierUnitPricePaise: integer("supplier_unit_price_paise").notNull(),
  taxPercentage: doublePrecision("tax_percentage").default(0).notNull(),
  leadTimeDays: integer("lead_time_days").default(0).notNull(),
  qty: doublePrecision().default(0).notNull(),
  uom: text().notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const supplierMaster = pgTable(
  "supplier_master",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    type: supplierType().default("raw_material").notNull(),
    gstNumber: text("gst_number"),
    panNumber: text("pan_number"),
    contactPerson: text("contact_person"),
    email: text(),
    phone: text(),
    address: text(),
    defaultPaymentTermsDays: integer("default_payment_terms_days").default(0),
    isActive: boolean("is_active").default(true).notNull(),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  },
  (table) => [unique("supplier_master_gst_number_key").on(table.gstNumber)],
);

export const supplierPayments = pgTable("supplier_payments", {
  id: serial().primaryKey(),
  invoiceId: integer("invoice_id").notNull(),
  amountPaidPaise: integer("amount_paid_paise").notNull(),
  paymentDate: timestamp("payment_date").notNull(),
  paymentMethod: text("payment_method").notNull(),
  transactionRef: text("transaction_ref"),
  notes: text(),
  createdBy: integer("created_by").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: serial().primaryKey(),
  name: text().notNull(),
  phone: text(),
  email: text(),
  gstNumber: text("gst_number"),
  address: text(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const vendorBills = pgTable("vendor_bills", {
  id: serial().primaryKey(),
  supplierId: integer("supplier_id").notNull(),
  poId: integer("po_id").references(() => purchaseOrders.id),
  amountPaise: integer("amount_paise").notNull(),
  gstPaise: integer("gst_paise").default(0).notNull(),
  dueDate: timestamp("due_date"),
  status: invoiceStatus().default("draft").notNull(),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  createdBy: integer("created_by"),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});

export const vendorPayments = pgTable("vendor_payments", {
  id: serial().primaryKey(),
  billId: integer("bill_id").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  method: text(),
  paidAt: timestamp("paid_at").default(sql`now()`).notNull(),
  notes: text(),
  recordedBy: integer("recorded_by"),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  lastUpdatedBy: integer("last_updated_by"),
  lastUpdatedAt: timestamp("last_updated_at").default(sql`now()`).notNull(),
});
