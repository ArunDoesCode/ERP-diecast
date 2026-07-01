import { pgTable, serial, integer, timestamp, text, jsonb } from "drizzle-orm/pg-core";
import { inspectionTypeEnum } from "./00_enums";
import { jobSteps } from "./03_jobs_ops";
import { employees } from "./01_auth";

export const qaLogs = pgTable("qa_logs", {
  id: serial("id").primaryKey(),
  jobStepId: integer("job_step_id")
    .notNull()
    .references(() => jobSteps.id),
  inspectionType: inspectionTypeEnum("inspection_type").notNull(),
  trialNumber: integer("trial_number"),         // null for non-trial inspections
  passQty: integer("pass_qty").notNull().default(0),
  failQty: integer("fail_qty").notNull().default(0),
  defectNotes: text("defect_notes"),            // short text; photos are primary evidence
  photosJson: jsonb("photos_json").default([]), // Supabase Storage URLs
  inspectorId: integer("inspector_id")
    .notNull()
    .references(() => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => employees.id),
  lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});
