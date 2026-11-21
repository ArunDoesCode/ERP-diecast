import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
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
import { supplierMaster } from "./02_procurement-suppliers";
import { employees } from "./03_hcm";

// Catalog master data used by supplier, purchasing, and inventory modules.
export const itemMaster = pgTable(
  "item_master",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").unique().notNull(), //internal SKU
    name: text("name").notNull(),
    description: text("description"),
    // no-index: low-card 5 values
    category: text("category").notNull(), // 'Raw Material', 'Consumable', 'Spare Part'
    uom: text("uom").notNull(), // 'kg', 'pcs', 'ltr'
    reorderLevel: doublePrecision("reorder_level").default(0).notNull(),
    // BR-RO-09: reorder quantities, item unit, 3 decimals; 0 = not set
    reorderQty: numeric("reorder_qty", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .default(0)
      .notNull(),
    minOrderQty: numeric("min_order_qty", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .default(0)
      .notNull(),
    orderMultiple: numeric("order_multiple", {
      precision: 14,
      scale: 3,
      mode: "number",
    })
      .default(0)
      .notNull(),
    currentStock: doublePrecision("current_stock").default(0).notNull(),
    averageCostPaise: bigint("average_cost_paise", { mode: "number" })
      .default(0)
      .notNull(),
    // no-index: low-card few distinct values, index would not be used
    isActive: boolean("is_active").notNull().default(true),
    // BR-SCO-09: HSN printed on the job-work challan; nullable, challan refused if missing.
    hsnCode: text("hsn_code"),
    // BR-INV-03: PR estimate / last-rate fallback; > 0 enforced by the API.
    // DB default 0 keeps db:push safe on rows that already exist.
    standardRatePaise: bigint("standard_rate_paise", { mode: "number" })
      .default(0)
      .notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // BR-INV-25
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (t) => ({
    reorderQtyCk: check(
      "item_master_reorder_qty_ck",
      sql`${t.reorderQty} >= 0`,
    ),
    minOrderQtyCk: check(
      "item_master_min_order_qty_ck",
      sql`${t.minOrderQty} >= 0`,
    ),
    orderMultipleCk: check(
      "item_master_order_multiple_ck",
      sql`${t.orderMultiple} >= 0`,
    ),
    // BR-RO-01: base set of the live reorder list and the run
    reorderIdx: index("idx_item_master_reorder")
      .on(t.id)
      .where(sql`${t.reorderLevel} > 0`),
    // BR-INV-01: unique ignoring case and outer spaces
    skuNormUq: uniqueIndex("uq_item_master_sku_norm").on(
      sql`lower(btrim(${t.sku}))`,
    ),
    // Item / stock list search (ilike %q%, #38): pg_trgm GIN
    skuTrgm: index("idx_item_master_sku_trgm").using(
      "gin",
      t.sku.op("gin_trgm_ops"),
    ),
    nameTrgm: index("idx_item_master_name_trgm").using(
      "gin",
      t.name.op("gin_trgm_ops"),
    ),
  }),
);

export const serviceMaster = pgTable(
  "service_master",
  {
    id: serial("id").primaryKey(),
    code: text("code").unique().notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sacCode: text("sac_code"),
    defaultUom: text("default_uom").notNull(), // 'job', 'hour', 'lot'
    // no-index: low-card few distinct values, index would not be used
    isActive: boolean("is_active").notNull().default(true),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // BR-INV-09: code unique ignoring case
    codeNormUq: uniqueIndex("uq_service_master_code_norm").on(
      sql`lower(btrim(${t.code}))`,
    ),
  }),
);

// 1. Direction of movement
export const inventoryTxTypeEnum = pgEnum("inventory_tx_type", [
  "in", // Things entering a location
  "out", // Things leaving a location
  "adjustment", // Manual stock-take corrections
]);

// 2. The "Why" did it move? (The Reference)
export const inventoryRefTypeEnum = pgEnum("inventory_ref_type", [
  "grn", // Standard Supplier Receipt
  "grn_bypass", // Fast-track QA bypass Receipt
  "pro", // Purchase Return (Sent back to supplier)
  "pro_cancel", // Counter row of a cancelled posted purchase return (BR-PRT-26)
  "sco_issue", // Sent out to Subcontractor
  "sco_receipt", // Received back from Subcontractor
  "job_order_issue", // AUTOMATIC: Consumed by furnace/machine (Backflush)
  "scrap_dispatch", // Sold scrap/dross outward
  "stock_adjustment", // Manual correction after physical audit
  "grn_correction", // Correction of a posted GRN line (BR-GRN-32)
  "opening_stock", // Manual opening balance (BR-GRN-40, 43)
  "sco_loss", // Loss at a subcontractor (BR-SCO-19)
  "stock_transfer", // Move between two of our locations (BR-STR-11)
  "stock_transfer_reversal", // Counter rows of a reversed transfer (BR-STR-20)
  "delivery_note", // Stock out of a posted delivery note (BR-DSP-12)
  "delivery_note_cancel", // Counter row of a cancelled posted delivery note (BR-DSP-31)
]);

export const locationTypeEnum = pgEnum("location_type", [
  "main_store", // Where raw materials and bought-outs live
  "vendor_premise", // Where SCO/Job Work materials live (Virtual)
  "finished_goods", // Where packed, QA-passed customer orders live
  "scrap_yard", // Where dross and rejected parts live before selling
  "store", // Any other physical store, e.g. tool crib, line store (BR-STR-32). Not virtual.
]);

export const locations = pgTable(
  "locations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: locationTypeEnum("type").notNull(),
    isVirtual: boolean("is_virtual").default(false).notNull(),
    linkedVendorId: integer("linked_vendor_id").references(
      () => supplierMaster.id,
    ),
    // no-index: tiny static or config table, under about 100 rows
    isActive: boolean("is_active").notNull().default(true),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // BR-INV-11: name unique ignoring case
    nameNormUq: uniqueIndex("uq_locations_name_norm").on(
      sql`lower(btrim(${t.name}))`,
    ),
    // BR-INV-13: exactly one main_store
    oneMainStoreUq: uniqueIndex("uq_locations_one_main_store")
      .on(t.type)
      .where(sql`${t.type} = 'main_store'`),
    // BR-INV-12: at most one vendor_premise per supplier
    oneVendorPremiseUq: uniqueIndex("uq_locations_one_vendor_premise")
      .on(t.linkedVendorId)
      .where(sql`${t.type} = 'vendor_premise'`),
  }),
);

// 3. The Ledger Engine
export const inventoryLedger = pgTable(
  "inventory_ledger",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),

    // LOCATION (Perimeter only: Main Store, Vendor, Finished Goods, Scrap)
    locationId: integer("location_id")
      .references(() => locations.id)
      .notNull(),

    // TRACEABILITY (Melt / Heat Number)
    batchNumber: text("batch_number"),

    // MOVEMENT DATA
    // no-index: low-card the list is paged in primary-key order
    transactionType: inventoryTxTypeEnum("transaction_type").notNull(),
    referenceType: inventoryRefTypeEnum("reference_type").notNull(),
    referenceId: integer("reference_id").notNull(), // ID of the GRN, SCO, or Job Order
    // Line of the reference document (e.g. grn_items.id) - BR-GRN-21, 32
    referenceLineId: integer("reference_line_id"),

    // QUANTITY
    quantityChange: doublePrecision("quantity_change").notNull(), // + for IN, - for OUT
    balanceAfter: doublePrecision("balance_after").notNull(),

    // FINANCIAL VALUATION (Costing at the exact moment of movement)
    unitCostPaise: bigint("unit_cost_paise", { mode: "number" }).notNull(),
    totalValueChangePaise: bigint("total_value_change_paise", {
      mode: "number",
    }).notNull(),

    // METADATA
    notes: text("notes"),
    // no-index: audit largest table: an unused index costs every posting
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(), // System uses a 'System' user ID for backflush
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    refTypeIdIdx: index("idx_inventory_ledger_reftype_id").on(
      table.referenceType,
      table.id,
    ),
    itemLocationIdx: index("idx_inventory_ledger_item_location").on(
      table.itemId,
      table.locationId,
      table.id.desc(),
    ),
    referenceLineIdx: index("idx_inventory_ledger_reference_line").on(
      table.referenceLineId,
    ),
    locationIdx: index("idx_inventory_ledger_location").on(
      table.locationId,
      table.id.desc(),
    ),
    createdAtIdx: index("idx_inventory_ledger_created_at").on(table.createdAt),
    // Loss log (BR-SCO-19): only the few write-off rows, newest first.
    scoLossIdx: index("idx_inventory_ledger_sco_loss")
      .on(table.createdAt.desc(), table.id)
      .where(sql`${table.referenceType} = 'sco_loss'`),
  }),
);

// 4. Stock transfer: move stock between two of our own locations (BR-STR-01..).
export const stockTransferStatusEnum = pgEnum("stock_transfer_status", [
  "draft",
  "posted",
  "cancelled",
  "reversed",
]);

export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: serial("id").primaryKey(),
    // BR-STR-08: ST-<IST year>-<seq>
    transferNumber: text("transfer_number").unique().notNull(),
    status: stockTransferStatusEnum("status").default("draft").notNull(),
    sourceLocationId: integer("source_location_id")
      .references(() => locations.id)
      .notNull(),
    destinationLocationId: integer("destination_location_id")
      .references(() => locations.id)
      .notNull(),
    notes: text("notes"),
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
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    postedBy: integer("posted_by").references(() => employees.id),
    postedAt: timestamp("posted_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    reversedBy: integer("reversed_by").references(() => employees.id),
    reversedAt: timestamp("reversed_at"),
    reverseReason: text("reverse_reason"),
  },
  (t) => ({
    differentLocationsCk: check(
      "stock_transfers_locations_differ_ck",
      sql`${t.sourceLocationId} <> ${t.destinationLocationId}`,
    ),
    reverseReasonCk: check(
      "stock_transfers_reverse_reason_ck",
      sql`${t.reversedAt} is null or ${t.reverseReason} is not null`,
    ),
    postedAtCk: check(
      "stock_transfers_posted_at_ck",
      sql`${t.status} <> 'posted' or ${t.postedAt} is not null`,
    ),
    cancelledAtCk: check(
      "stock_transfers_cancelled_at_ck",
      sql`${t.status} <> 'cancelled' or ${t.cancelledAt} is not null`,
    ),
    reversedAtCk: check(
      "stock_transfers_reversed_at_ck",
      sql`${t.status} <> 'reversed' or ${t.reversedAt} is not null`,
    ),
    statusIdIdx: index("idx_stock_transfers_status_id").on(
      t.status,
      t.id.desc(),
    ),
    sourceIdx: index("idx_stock_transfers_source").on(t.sourceLocationId),
    destinationIdx: index("idx_stock_transfers_destination").on(
      t.destinationLocationId,
    ),
    createdAtIdx: index("idx_stock_transfers_created_at").on(
      t.createdAt.desc(),
    ),
  }),
);

export const stockTransferItems = pgTable(
  "stock_transfer_items",
  {
    // This id is the ledger reference_line_id (BR-STR-11).
    id: serial("id").primaryKey(),
    transferId: integer("transfer_id")
      .references(() => stockTransfers.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // BR-STR-04, 05: item unit, 3 dp, whole for pcs/set (checked by the API).
    qty: numeric("qty", { precision: 13, scale: 3, mode: "number" }).notNull(),
    // BR-STR-14, 20, 23: item average read at post; null until posted.
    postedUnitCostPaise: bigint("posted_unit_cost_paise", { mode: "number" }),
    postedValuePaise: bigint("posted_value_paise", { mode: "number" }),
  },
  (t) => ({
    transferItemUq: uniqueIndex("uq_stock_transfer_items_transfer_item").on(
      t.transferId,
      t.itemId,
    ),
    itemIdx: index("idx_stock_transfer_items_item").on(t.itemId),
    qtyCk: check(
      "stock_transfer_items_qty_ck",
      sql`${t.qty} > 0 and ${t.qty} <= 1000000000`,
    ),
  }),
);

export const machineStatusEnum = pgEnum("machine_status", [
  "idle",
  "running",
  "maintenance",
  "breakdown",
]);

export const machines = pgTable(
  "machines",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // BR-INV-16: required by the API; nullable in the DB so db:push is safe on
    // rows that predate the column.
    code: text("code"),
    // no-index: tiny static or config table, under about 100 rows
    isActive: boolean("is_active").notNull().default(true),
    type: text("type"),
    // no-index: tiny static or config table, under about 100 rows
    status: machineStatusEnum("status").default("idle").notNull(),
    lastMaintenanceAt: timestamp("last_maintenance_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (t) => ({
    nameNormUq: uniqueIndex("uq_machines_name_norm").on(
      sql`lower(btrim(${t.name}))`,
    ),
    codeNormUq: uniqueIndex("uq_machines_code_norm").on(
      sql`lower(btrim(${t.code}))`,
    ),
  }),
);
