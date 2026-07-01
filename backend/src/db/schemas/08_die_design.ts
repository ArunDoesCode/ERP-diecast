import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { dies, machines } from "./03_jobs_ops";
import { employees } from "./01_auth";

export const dieDesignTasks = pgTable("die_design_tasks", {
  id: serial("id").primaryKey(),
  dieId: integer("die_id")
    .notNull()
    .references(() => dies.id),
  assignedTo: integer("assigned_to").references(() => employees.id),
  status: text("status").notNull().default("pending"), // "pending" | "in_progress" | "done"
  notes: text("notes"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const cncPrograms = pgTable("cnc_programs", {
  id: serial("id").primaryKey(),
  dieId: integer("die_id")
    .notNull()
    .references(() => dies.id),
  programFileUrl: text("program_file_url"), // Supabase Storage
  machineId: integer("machine_id").references(() => machines.id),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
