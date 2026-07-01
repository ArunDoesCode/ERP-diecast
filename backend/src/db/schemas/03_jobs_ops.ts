import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  json,
} from "drizzle-orm/pg-core";
import {
  jobStatusEnum,
  stepStatusEnum,
  dieStatusEnum,
  machineStatusEnum,
} from "./00_enums";
import { customers } from "./02_sales";
import { employees } from "./01_auth";

export const dies = pgTable("dies", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").references(() => customers.id),
  partName: text("part_name").notNull(),
  material: text("material"),
  drawings: json("drawings")
    .$type<
      Array<{
        url: string;
        name?: string;
        uploadedAt?: string;
      }>
    >()
    .default([]), // e.g. "ADC12", "LM6"
  status: dieStatusEnum("status").notNull().default("active"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const machines = pgTable("machines", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type"), // e.g. "cold_chamber", "hot_chamber", "cnc", "trimming"
  status: machineStatusEnum("status").notNull().default("idle"),
  lastMaintenanceAt: timestamp("last_maintenance_at"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  salesOrderId: integer("sales_order_id"), // nullable: job can exist before formal SO
  dieId: integer("die_id").references(() => dies.id),
  targetQty: integer("target_qty").notNull(),
  status: jobStatusEnum("status").notNull().default("in_production"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const jobSteps = pgTable("job_steps", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  stepName: text("step_name").notNull(),
  status: stepStatusEnum("status").notNull().default("pending"),
  assignedTo: integer("assigned_to").references(() => employees.id),
  machineId: integer("machine_id").references(() => machines.id),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  actualQty: integer("actual_qty"),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const dispatchChallans = pgTable("dispatch_challans", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id")
    .notNull()
    .references(() => jobs.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  qty: integer("qty").notNull(),
  vehicleNumber: text("vehicle_number"),
  dispatchedAt: timestamp("dispatched_at").defaultNow().notNull(),
  notes: text("notes"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const machineLogs = pgTable("machine_logs", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id")
    .notNull()
    .references(() => machines.id),
  eventType: text("event_type").notNull(), // "breakdown" | "maintenance" | "repair" | "note"
  notes: text("notes"),
  recordedBy: integer("recorded_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const spareParts = pgTable("spare_parts", {
  id: serial("id").primaryKey(),
  machineId: integer("machine_id").references(() => machines.id),
  partName: text("part_name").notNull(),
  qtyOnHand: integer("qty_on_hand").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(0),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
