import { sql } from "drizzle-orm";
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
import { employees } from "./03_hcm";

export const supplierTypeEnum = pgEnum("supplier_type", [
  "raw_material", // Hindalco, local scrap/ingot sellers
  "consumables", // Foseco (flux, die spray), plungers
  "service_provider", // CNC shops, Anodizers, Transporters, External QA Labs
  "trader", // Buys and sells without manufacturing
  "both", // Provides materials and job-work services
]);

export const supplierMaster = pgTable(
  "supplier_master",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: supplierTypeEnum("type").default("raw_material").notNull(),
    gstNumber: text("gst_number").unique(),
    panNumber: text("pan_number"),
    contactPerson: text("contact_person"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    defaultPaymentTermsDays: integer("default_payment_terms_days")
      .default(0)
      .notNull(), // e.g., 30 days
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    // BR-SUP-01: unique ignoring case and outer spaces.
    // db:push RISK: fails if existing rows already clash (e.g. "Hindalco" and "hindalco ") - rename them first.
    nameNormUq: uniqueIndex("uq_supplier_master_name_norm").on(
      sql`lower(btrim(${t.name}))`,
    ),
  }),
);

// BR-SUP-10: one row per changed field (supplier master, item price row, service price row).
export const supplierHistoryEntityEnum = pgEnum("supplier_history_entity", [
  "supplier",
  "item",
  "service",
]);

export const supplierHistory = pgTable(
  "supplier_history",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    entity: supplierHistoryEntityEnum("entity").notNull(),
    // supplier_items.id / supplier_services.id for entity item/service; supplier id for entity supplier
    entityId: integer("entity_id").notNull(),
    field: text("field").notNull(), // e.g. name, gstNumber, supplierUnitPricePaise, taxPercentage, isActive
    oldValue: text("old_value"), // null = was empty / row created
    newValue: text("new_value"), // null = cleared
    changedBy: integer("changed_by")
      .references(() => employees.id)
      .notNull(),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => ({
    supplierChangedIdx: index("idx_supplier_history_supplier_changed").on(
      t.supplierId,
      t.changedAt,
    ),
  }),
);

export const supplierServices = pgTable(
  "supplier_services",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    serviceId: integer("service_id")
      .references(() => serviceMaster.id)
      .notNull(),
    serviceUnitPricePaise: integer("service_unit_price_paise").notNull(),
    taxPercentage: doublePrecision("tax_percentage").default(0).notNull(),
    leadTimeDays: integer("lead_time_days").default(0).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (table) => {
    return {
      uniqueSupplierService: uniqueIndex("unique_supplier_service_idx").on(
        table.supplierId,
        table.serviceId,
      ),
    };
  },
);

export const supplierItems = pgTable(
  "supplier_items",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id")
      .references(() => supplierMaster.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),

    // Suppliers rarely use your internal SKUs. They have their own part numbers.
    supplierSku: text("supplier_sku"),

    // The negotiated price for THIS specific supplier providing THIS specific item
    supplierUnitPricePaise: integer("supplier_unit_price_paise").notNull(),

    // Tax rate for this specific item/supplier combo (e.g., 18% GST on metals, 12% on some chemicals)
    taxPercentage: doublePrecision("tax_percentage").default(0).notNull(),

    // How long this specific supplier takes to deliver this item
    leadTimeDays: integer("lead_time_days").default(0).notNull(),
    qty: doublePrecision("qty").default(0).notNull(), // how much he can supply at this price
    uom: text("uom").notNull(), // 'kg', 'pcs', 'ltr' - should match the item's UOM

    // Is this supplier still approved for this item?
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (table) => {
    // Ensure you can't accidentally add the same item to the same supplier twice
    return {
      uniqueSupplierItem: uniqueIndex("unique_supplier_item_idx").on(
        table.supplierId,
        table.itemId,
      ),
      // BR-INV-04 in-use check and item lookups lead with item_id
      itemIdIdx: index("idx_supplier_items_item_id").on(table.itemId),
    };
  },
);
