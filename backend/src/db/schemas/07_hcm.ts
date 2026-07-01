import { pgTable, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { employees } from "./01_auth";

export const attendance = pgTable("attendance", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  date: date("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  month: integer("month").notNull(), // 1–12
  year: integer("year").notNull(),
  totalPaise: integer("total_paise").notNull().default(0),
  status: integer("status").notNull().default(0), // 0=draft 1=approved 2=paid
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});

export const payrollItems = pgTable("payroll_items", {
  id: serial("id").primaryKey(),
  payrollRunId: integer("payroll_run_id")
    .notNull()
    .references(() => payrollRuns.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id")
    .notNull()
    .references(() => employees.id),
  daysPresent: integer("days_present").notNull().default(0),
  dailyRatePaise: integer("daily_rate_paise").notNull(),
  grossPaise: integer("gross_paise").notNull(),
  deductionsPaise: integer("deductions_paise").notNull().default(0),
  netPaise: integer("net_paise").notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
