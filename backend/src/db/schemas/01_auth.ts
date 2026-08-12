import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { employees } from "./03_hcm";

export const roles = pgTable("roles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isSystem: boolean("is_system").notNull().default(false), // seed Owner, BackOffice, super-admin as true
  createdBy: integer("created_by").references((): any => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const modules = pgTable("modules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  path: text("path").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  moduleId: integer("module_id").references(() => modules.id),
  createdBy: integer("created_by").references((): any => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rolePages = pgTable(
  "role_pages",
  {
    id: serial("id").primaryKey(),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    pageId: integer("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("role_pages_role_id_page_id_unique").on(table.roleId, table.pageId),
  ],
);

export const refreshTokens = pgTable("refresh_tokens", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shared numbering series for business documents (PR/PO/SCO/etc.) by period.
export const documentNumberCounters = pgTable(
  "document_number_counters",
  {
    id: serial("id").primaryKey(),
    docType: text("doc_type").notNull(),
    periodKey: text("period_key").notNull(), // Example: 2026-07 or FY26-27
    lastSeq: integer("last_seq").notNull().default(0),
    createdBy: integer("created_by").references(() => employees.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("document_number_counters_doc_type_period_key_unique").on(
      table.docType,
      table.periodKey,
    ),
  ],
);
