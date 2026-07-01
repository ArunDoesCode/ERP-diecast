import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { invoiceStatusEnum } from "./00_enums";
import { salesOrders, customers } from "./02_sales";
import { suppliers, purchaseOrders } from "./04_purchase";
import { employees } from "./01_auth";

export const customerInvoices = pgTable("customer_invoices", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id").references(() => salesOrders.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  amountPaise: integer("amount_paise").notNull(),
  gstPaise: integer("gst_paise").notNull().default(0),
  dueDate: timestamp("due_date"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const customerPayments = pgTable("customer_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => customerInvoices.id),
  amountPaise: integer("amount_paise").notNull(),
  method: text("method"), // "upi" | "neft" | "cheque" | "cash"
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const vendorBills = pgTable("vendor_bills", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  poId: integer("po_id").references(() => purchaseOrders.id),
  amountPaise: integer("amount_paise").notNull(),
  gstPaise: integer("gst_paise").notNull().default(0),
  dueDate: timestamp("due_date"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});


export const vendorPayments = pgTable("vendor_payments", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id")
    .notNull()
    .references(() => vendorBills.id),
  amountPaise: integer("amount_paise").notNull(),
  method: text("method"),
  paidAt: timestamp("paid_at").defaultNow().notNull(),
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // "fuel" | "repair" | "office" | "misc"
  amountPaise: integer("amount_paise").notNull(),
  paidBy: integer("paid_by").references(() => employees.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
