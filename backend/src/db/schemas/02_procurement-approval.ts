import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employees } from "./03_hcm";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ApprovalChainStep = {
  level: number;
  approverType: "role" | "specific";
  role?: string | undefined; // role name, e.g. "store_manager"
  employeeId?: number | undefined; // specific person (for owner in small factories)
};

export const procurementCategoryEnum = pgEnum("procurement_category", [
  "any", // <--- ADD THIS (for generic policies)
  "sale_order",
  "stock_reorder",
  "maintenance",
  "tooling",
  "subcontracting",
  "misc",
]);

export const approvalDocTypeEnum = pgEnum("approval_doc_type", [
  "pr",
  "po",
  "sco",
]);

export const approvalActionEnum = pgEnum("approval_action", [
  "submitted",
  "approved",
  "rejected",
  "require_more_info",
  "auto_approved",
  "cancelled",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending_approval",
  "approved",
  "rejected",
  "require_more_info",
  "partial_ordered",
  "fully_ordered",
  "auto_approved",
  "cancelled",
]);

export const approvalPolicies = pgTable(
  "approval_policies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull(), // 1 = checked first

    // Match conditions (null = matches anything)
    docType: approvalDocTypeEnum("doc_type").notNull(),
    subDocType: procurementCategoryEnum("sub_doc_type")
      .default("any")
      .notNull(),
    isSaleOrderLinked: boolean("is_sale_order_linked"), // null = any
    minAmountPaise: bigint("min_amount_paise", { mode: "number" }),
    maxAmountPaise: bigint("max_amount_paise", { mode: "number" }),

    // What happens
    autoApprove: boolean("auto_approve").notNull().default(false),
    approvalLevels: integer("approval_levels").notNull().default(1),

    // Who approves, in order. Array of ApprovalChainStep.
    // [{ level: 1, approverType: "role", role: "store_manager" },
    //  { level: 2, approverType: "specific", employeeId: 5 }]
    approvalChain: jsonb("approval_chain")
      .notNull()
      .$type<ApprovalChainStep[]>(),
    // Example: [
    //   { "level": 1, "role": "backoffice", "specificEmployeeId": null },
    //   { "level": 2, "role": null, "specificEmployeeId": 5 } // Employee ID 5 is the Owner
    // ]

    createdAt: timestamp("created_at").defaultNow().notNull(),
    createdBy: integer("created_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  },
  (table) => ({
    // CHANGE THIS:
    // Because we use "any" instead of NULL, we don't need the messy coalesce() SQL hack anymore!
    uniquePriority: uniqueIndex("uq_policy_priority_doctype_subdoctype")
      .on(table.priority, table.docType, table.subDocType)
      .where(sql`${table.isActive} = true`),
  }),
);

// ─── Approval Requests (one per PR/PO submission) ───────────────────────────

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: serial("id").primaryKey(),
    docType: approvalDocTypeEnum("doc_type").notNull(),
    docId: integer("doc_id").notNull(), // FK to pr.id or po.id

    policyId: integer("policy_id")
      .references(() => approvalPolicies.id)
      .notNull(), // which policy matched

    status: approvalStatusEnum("status").notNull().default("pending_approval"),
    currentLevel: integer("current_level").notNull().default(1),
    totalLevels: integer("total_levels").notNull(),

    // Snapshot of the chain at submission time (so policy edits don't
    // corrupt in-flight approvals)
    chainSnapshot: jsonb("chain_snapshot")
      .notNull()
      .$type<ApprovalChainStep[]>(),

    // Materialized copy of the current chain step's approver, kept in sync
    // whenever currentLevel changes, so pending-approval lookups can filter
    // in SQL instead of scanning chainSnapshot in JS.
    currentApproverRole: text("current_approver_role"),
    currentApproverEmployeeId: integer(
      "current_approver_employee_id",
    ).references(() => employees.id),

    requestedBy: integer("requested_by")
      .references(() => employees.id)
      .notNull(),
    requestedAt: timestamp("requested_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"), // when fully approved/rejected
  },
  (table) => ({
    uniqueOpenRequestPerDoc: uniqueIndex("uq_open_approval_request_per_doc")
      .on(table.docType, table.docId)
      .where(sql`${table.status} = 'pending_approval'`),
    docIdx: index("idx_approval_requests_doc").on(table.docType, table.docId),
    statusRoleIdx: index("idx_approval_requests_status_role").on(
      table.status,
      table.currentApproverRole,
    ),
    statusEmployeeIdx: index("idx_approval_requests_status_employee").on(
      table.status,
      table.currentApproverEmployeeId,
    ),
  }),
);

export const approvalTrails = pgTable(
  "approval_trails",
  {
    id: serial("id").primaryKey(),
    requestId: integer("request_id")
      .references(() => approvalRequests.id)
      .notNull(),
    docType: approvalDocTypeEnum("doc_type").notNull(),
    docId: integer("doc_id").notNull(),
    level: integer("level").notNull(),
    action: approvalActionEnum("action").notNull(),
    actionBy: integer("action_by")
      .references(() => employees.id)
      .notNull(),
    actionAt: timestamp("action_at").defaultNow().notNull(),
    notes: text("notes"),
  },
  (table) => ({
    requestIdIdx: index("idx_approval_trails_request_id").on(table.requestId),
  }),
);
