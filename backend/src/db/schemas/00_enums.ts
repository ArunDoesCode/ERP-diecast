import { pgEnum } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", [
  "owner",
  "back_office",
  "floor_supervisor",
  "qa_inspector",
  "die_designer",
  "operator",
]);

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
  "sent",
  "partial",
  "complete",
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
