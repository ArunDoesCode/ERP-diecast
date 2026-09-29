import {
  type AnyPgColumn,
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  // set null: removing an employee row must not be blocked by roles they created (the access log keeps who)
  createdBy: integer("created_by").references((): AnyPgColumn => employees.id, {
    onDelete: "set null",
  }),
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

// Permission keys are defined in code (lib/permissions.ts) and synced here.
export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(),
  module: text("module").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  grantable: boolean("grantable").notNull().default(true),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
    grantedBy: integer("granted_by").references(
      (): AnyPgColumn => employees.id,
      { onDelete: "set null" },
    ),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionKey] })],
);

// Screens are defined in code: code owns key/path/permissionKey, the UI owns label/sortOrder/menuGroup.
export const screens = pgTable("screens", {
  key: text("key").primaryKey(),
  path: text("path").notNull(),
  permissionKey: text("permission_key").references(() => permissions.key, {
    onDelete: "set null",
  }), // null = any signed-in user
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  menuGroup: text("menu_group").notNull(),
});

// Insert-only access log (BR-AUTH-20). No update/delete code paths may exist.
export const authAuditLog = pgTable("auth_audit_log", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references((): AnyPgColumn => employees.id),
  action: text("action").notNull(),
  target: text("target").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at").defaultNow().notNull(),
});

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
