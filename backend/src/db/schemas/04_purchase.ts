import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
} from "drizzle-orm/pg-core";
import { poStatusEnum, prStatusEnum } from "./00_enums";
import { employees } from "./01_auth";



export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  itemName: text("item_name").notNull().unique(),
  uom: text("uom").notNull(),
  qtyOnHand: numeric("qty_on_hand").notNull().default("0"),
  reorderLevel: numeric("reorder_level").notNull().default("0"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

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

export const purchaseRequisitions = pgTable("purchase_requisitions", {
  id: serial("id").primaryKey(),
  status: prStatusEnum("status").notNull().default("draft"),

  // Who asked for this? (Storekeeper, Supervisor, etc.)
  requestedBy: integer("requested_by")
    .notNull()
    .references(() => employees.id),

  // Who approved it? (Owner/Plant Head)
  approvedBy: integer("approved_by").references(() => employees.id),
  approvedAt: timestamp("approved_at"),

  notes: text("notes"), // General notes for the whole PR

  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

// --- PR LINE ITEMS ---
export const purchaseRequisitionItems = pgTable("purchase_requisition_items", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id")
    .notNull()
    .references(() => purchaseRequisitions.id, { onDelete: "cascade" }),
    
  // Optional link to your inventory master. 
  // If it's a brand new item not in inventory yet, inventoryId is null, but itemName is still required.
  inventoryId: integer("inventory_id").references(() => inventory.id),
  
  itemName: text("item_name").notNull(),
  qty: numeric("qty").notNull(),
  uom: text("uom").notNull(), // "kg" | "pcs" | "litre"
  remarks: text("remarks"), // e.g., "Urgent: Plunger tip for Machine 4"
  
  // Placeholder for when this PR line gets converted into a PO line.
  // (You will add the actual foreign key constraint once you create the `purchaseOrderItems` table)
  poItemId: integer("po_item_id"), 

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
  uom: text("uom").notNull(), // "kg" | "pcs" | "litre"
  unitCostPaise: integer("unit_cost_paise").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

