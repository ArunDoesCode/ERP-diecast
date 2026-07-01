import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { employees } from "./01_auth";

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  gstNumber: text("gst_number"),
  address: text("address"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const enquiries = pgTable("enquiries", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  description: text("description"),
  filesJson: jsonb("files_json").default([]), // array of Supabase Storage URLs
  status: text("status").notNull().default("open"), // open | quoted | closed | lost
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const quotations = pgTable("quotations", {
  id: serial("id").primaryKey(),
  enquiryId: integer("enquiry_id")
    .notNull()
    .references(() => enquiries.id),
  version: integer("version").notNull().default(1),
  amountPaise: integer("amount_paise").notNull(),
  deliveryDate: timestamp("delivery_date"),
  status: text("status").notNull().default("draft"), // draft | sent | accepted | rejected
  notes: text("notes"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const salesOrders = pgTable("sales_orders", {
  id: serial("id").primaryKey(),
  quotationId: integer("quotation_id").references(() => quotations.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  totalPaise: integer("total_paise").notNull(),
  status: text("status").notNull().default("confirmed"), // confirmed | in_production | dispatched | complete
  notes: text("notes"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
