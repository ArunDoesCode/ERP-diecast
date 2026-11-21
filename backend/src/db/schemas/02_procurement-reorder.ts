import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { itemMaster } from "./02_procurement-catalog";
import { purchaseRequestItems } from "./02_procurement-purchasing";
import { employees } from "./03_hcm";

// Automatic reorder (docs/specs/reorder/design/data.md). Quantities are
// numeric(14,3) read as number; the maths runs on integer thousandths.
const qty = (name: string) =>
  numeric(name, { precision: 14, scale: 3, mode: "number" });

export const reorderRunTriggerEnum = pgEnum("reorder_run_trigger", [
  "schedule",
  "manual",
]);

export const reorderRunStateEnum = pgEnum("reorder_run_state", [
  "running",
  "done",
  "failed",
]);

export const reorderItemOutcomeEnum = pgEnum("reorder_item_outcome", [
  "raised",
  "needs_reorder_qty",
  "invalid_line",
  "deferred",
]);

// BR-RO-10, 14, 20: one row (id = 1), inserted by the migration.
export const reorderSettings = pgTable(
  "reorder_settings",
  {
    id: integer("id").primaryKey().default(1),
    enabled: boolean("enabled").notNull().default(false),
    // IST hour of the daily run
    runHour: smallint("run_hour").notNull().default(7),
    // no-index: tiny one row
    draftOwnerId: integer("draft_owner_id").references(() => employees.id),
    // moved when enabled or run_hour changes (catch-up rule, BR-RO-10)
    scheduleChangedAt: timestamp("schedule_changed_at").defaultNow().notNull(),
    // no-index: tiny one row
    updatedBy: integer("updated_by").references(() => employees.id),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({
    singleRow: check("reorder_settings_single_row", sql`${t.id} = 1`),
    runHourCk: check(
      "reorder_settings_run_hour_ck",
      sql`${t.runHour} between 0 and 23`,
    ),
  }),
);

// BR-RO-20: one row per changed field (who, when, before -> after). Append-only.
export const reorderSettingsHistory = pgTable(
  "reorder_settings_history",
  {
    id: serial("id").primaryKey(),
    // enabled | runHour | draftOwnerId
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value").notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    createdAtIdx: index("idx_reorder_settings_history_created_at").on(
      t.createdAt.desc(),
      t.id.desc(),
    ),
  }),
);

// BR-RO-10..16, 22: one row per run. The PR link is read through
// purchase_requests.reorder_run_id (one source, no circular FK).
export const reorderRuns = pgTable(
  "reorder_runs",
  {
    id: serial("id").primaryKey(),
    // no-index: low-card covered by idx_reorder_runs_state_started
    trigger: reorderRunTriggerEnum("trigger").notNull(),
    state: reorderRunStateEnum("state").notNull(),
    // null = daily schedule
    startedBy: integer("started_by").references(() => employees.id),
    // IST day; set only when trigger = schedule
    scheduledDay: date("scheduled_day"),
    draftOwnerId: integer("draft_owner_id").references(() => employees.id),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
    itemsChecked: integer("items_checked").notNull().default(0),
    itemsRaised: integer("items_raised").notNull().default(0),
    itemsSkipped: integer("items_skipped").notNull().default(0),
    itemsDeferred: integer("items_deferred").notNull().default(0),
    // whitelist code + fixed plain text; raw errors go to the server log only
    failureReason: text("failure_reason"),
  },
  (t) => ({
    finishedCk: check(
      "reorder_runs_finished_ck",
      sql`(${t.state} = 'running') = (${t.finishedAt} is null)`,
    ),
    failureReasonCk: check(
      "reorder_runs_failure_reason_ck",
      sql`${t.failureReason} is null or char_length(${t.failureReason}) <= 500`,
    ),
    // BR-RO-12: one running run at a time
    oneRunningUq: uniqueIndex("uq_reorder_runs_one_running")
      .on(t.state)
      .where(sql`${t.state} = 'running'`),
    // BR-RO-10: once per IST day across processes
    scheduleDayUq: uniqueIndex("uq_reorder_runs_schedule_day")
      .on(t.scheduledDay)
      .where(sql`${t.trigger} = 'schedule'`),
    startedIdx: index("idx_reorder_runs_started_at").on(
      t.startedAt.desc(),
      t.id.desc(),
    ),
    stateStartedIdx: index("idx_reorder_runs_state_started").on(
      t.state,
      t.startedAt.desc(),
    ),
    startedByIdx: index("idx_reorder_runs_started_by").on(t.startedBy),
    draftOwnerIdx: index("idx_reorder_runs_draft_owner_id").on(t.draftOwnerId),
  }),
);

// BR-RO-22: one row per raised, needs-a-reorder-qty, invalid-line or deferred
// item. OK and covered items are only counted.
export const reorderRunItems = pgTable(
  "reorder_run_items",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .references(() => reorderRuns.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // no-index: low-card
    outcome: reorderItemOutcomeEnum("outcome").notNull(),
    // copy of the item unit at run time
    uom: text("uom").notNull(),
    usableQty: qty("usable_qty").notNull(),
    onTheWayQty: qty("on_the_way_qty").notNull(),
    // may be negative
    projectedQty: qty("projected_qty").notNull(),
    reorderLevel: qty("reorder_level").notNull(),
    reorderQty: qty("reorder_qty").notNull(),
    // null when needs_reorder_qty; > 0 when raised
    orderQty: qty("order_qty"),
    prItemId: integer("pr_item_id").references(() => purchaseRequestItems.id),
  },
  (t) => ({
    // also the run-detail query
    runItemUq: uniqueIndex("uq_reorder_run_items_run_item").on(
      t.runId,
      t.itemId,
    ),
    itemIdx: index("idx_reorder_run_items_item_id").on(t.itemId),
    prItemIdx: index("idx_reorder_run_items_pr_item_id")
      .on(t.prItemId)
      .where(sql`${t.prItemId} is not null`),
  }),
);
