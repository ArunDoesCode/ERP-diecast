import { pgEnum } from "drizzle-orm/pg-core";

export const jobStatusEnum = pgEnum("job_status", [
  "enquiry",
  "quoted",
  "order_received",
  "in_production",
  "dispatched",
  "invoiced",
  "complete",
]);

export const stepStatusEnum = pgEnum("step_status", [
  "pending",
  "active",
  "done",
  "blocked",
  "rework",
]);

export const inspectionTypeEnum = pgEnum("inspection_type", [
  "inward",
  "in_process",
  "trial",
  "final",
]);

export const poStatusEnum = pgEnum("po_status", [
  "draft",
  "pending_approval",
  "approved",
  "partial",
  "rejected",
  "cancelled",
]);

// NEW enum
export const prStatusEnum = pgEnum("pr_status", [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "ordered", // PO has been created for this PR
  "cancelled",
]);


export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
]);

export const dieStatusEnum = pgEnum("die_status", [
  "active",
  "retired",
  "in_design",
]);

export const machineStatusEnum = pgEnum("machine_status", [
  "idle",
  "running",
  "maintenance",
  "breakdown",
]);
