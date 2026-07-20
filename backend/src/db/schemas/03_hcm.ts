import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { roles } from "./01_auth";

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(), // null for QR-only operators
  passwordHash: text("password_hash"), // null for QR-only operators
  phone: text("phone"),
  qrToken: text("qr_token").unique(), // for operator QR login
  roleId: integer("role_id")
    .notNull()
    .references(() => roles.id),
  dailyRatePaise: integer("daily_rate_paise").default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by").references((): any => employees.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUpdatedBy: integer("last_updated_by").references((): any => employees.id),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
});