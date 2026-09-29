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
} from "drizzle-orm/pg-core";
import { supplierMaster } from "./02_procurement-suppliers";
import { employees } from "./03_hcm";

// Catalog master data used by supplier, purchasing, and inventory modules.
export const itemMaster = pgTable("item_master", {
  id: serial("id").primaryKey(),
  sku: text("sku").unique().notNull(), //internal SKU
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // 'Raw Material', 'Consumable', 'Spare Part'
  uom: text("uom").notNull(), // 'kg', 'pcs', 'ltr'
  reorderLevel: doublePrecision("reorder_level").default(0).notNull(),
  currentStock: doublePrecision("current_stock").default(0).notNull(),
  averageCostPaise: integer("average_cost_paise").default(0).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const serviceMaster = pgTable("service_master", {
  id: serial("id").primaryKey(),
  code: text("code").unique().notNull(),
  name: text("name").notNull(),
  description: text("description"),
  sacCode: text("sac_code"),
  defaultUom: text("default_uom").notNull(), // 'job', 'hour', 'lot'
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

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
  "sco_issue", // Sent out to Subcontractor
  "sco_receipt", // Received back from Subcontractor
  "job_order_issue", // AUTOMATIC: Consumed by furnace/machine (Backflush)
  "scrap_dispatch", // Sold scrap/dross outward
  "stock_adjustment", // Manual correction after physical audit
  "grn_correction", // Correction of a posted GRN line (BR-GRN-32)
  "opening_stock", // Manual opening balance (BR-GRN-40, 43)
  "sco_loss", // Loss at a subcontractor (BR-SCO-19)
]);

export const locationTypeEnum = pgEnum("location_type", [
  "main_store", // Where raw materials and bought-outs live
  "vendor_premise", // Where SCO/Job Work materials live (Virtual)
  "finished_goods", // Where packed, QA-passed customer orders live
  "scrap_yard", // Where dross and rejected parts live before selling
]);

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: locationTypeEnum("type").notNull(),
  isVirtual: boolean("is_virtual").default(false).notNull(),
  linkedVendorId: integer("linked_vendor_id").references(
    () => supplierMaster.id,
  ),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
    transactionType: inventoryTxTypeEnum("transaction_type").notNull(),
    referenceType: inventoryRefTypeEnum("reference_type").notNull(),
    referenceId: integer("reference_id").notNull(), // ID of the GRN, SCO, or Job Order
    // Line of the reference document (e.g. grn_items.id) - BR-GRN-21, 32
    referenceLineId: integer("reference_line_id"),

    // QUANTITY
    quantityChange: doublePrecision("quantity_change").notNull(), // + for IN, - for OUT
    balanceAfter: doublePrecision("balance_after").notNull(),

    // FINANCIAL VALUATION (Costing at the exact moment of movement)
    unitCostPaise: integer("unit_cost_paise").notNull(),
    totalValueChangePaise: integer("total_value_change_paise").notNull(),

    // METADATA
    notes: text("notes"),
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(), // System uses a 'System' user ID for backflush
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    itemLocationIdx: index("idx_inventory_ledger_item_location").on(
      table.itemId,
      table.locationId,
      table.id.desc(),
    ),
    referenceLineIdx: index("idx_inventory_ledger_reference_line").on(
      table.referenceLineId,
    ),
  }),
);

export const machineStatusEnum = pgEnum("machine_status", [
  "idle",
  "running",
  "maintenance",
  "breakdown",
]);

export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type"),
  status: machineStatusEnum("status").default("idle").notNull(),
  lastMaintenanceAt: timestamp("last_maintenance_at"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
