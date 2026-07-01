import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { poStatusEnum } from "./00_enums";
import { employees } from "./01_auth";

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  gstNumber: text("gst_number"),
  address: text("address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  totalPaise: integer("total_paise").notNull(),
  status: poStatusEnum("status").notNull().default("draft"),
  expectedDate: timestamp("expected_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const grn = pgTable("grn", {
  // Goods Receipt Notes
  id: serial("id").primaryKey(),
  poId: integer("po_id").references(() => purchaseOrders.id),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
  notes: text("notes"),
  receivedBy: integer("received_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const grnItems = pgTable("grn_items", {
  id: serial("id").primaryKey(),
  grnId: integer("grn_id")
    .notNull()
    .references(() => grn.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  qty: numeric("qty").notNull(),
  unit: text("unit").notNull(), // "kg" | "pcs" | "litre"
  unitCostPaise: integer("unit_cost_paise").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  itemName: text("item_name").notNull().unique(),
  unit: text("unit").notNull(),
  qtyOnHand: numeric("qty_on_hand").notNull().default("0"),
  reorderLevel: numeric("reorder_level").notNull().default("0"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(()=> employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
