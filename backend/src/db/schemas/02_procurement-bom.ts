import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { itemMaster, serviceMaster } from "./02_procurement-catalog";
import { supplierMaster } from "./02_procurement-suppliers";
import { employees } from "./03_hcm";

// BOM (bill of materials): one row per revision of a part. design/data.md.
export const bomKindEnum = pgEnum("bom_kind", [
  "casting", // alloy melted and poured
  "job_work", // sent out to a job worker and returned
  "assembly", // components put together
]);

export const bomStatusEnum = pgEnum("bom_status", [
  "draft",
  "active",
  "retired", // final
]);

export const bomHistoryActionEnum = pgEnum("bom_history_action", [
  "create", // start-revision logs create too
  "edit",
  "delete",
  "release",
  "retire",
]);

export const boms = pgTable(
  "boms",
  {
    id: serial("id").primaryKey(),
    // BR-BOM-01: a part never changes after create
    partId: integer("part_id")
      .references(() => itemMaster.id)
      .notNull(),
    // BR-BOM-02: 1 = A, 2 = B ... 27 = AA; the BOM number is never stored
    revisionNo: integer("revision_no").notNull(),
    // no-index: low-card 3 values, covered by idx_boms_status_kind
    kind: bomKindEnum("kind").notNull(),
    // BR-BOM-11, 12: +1 on every draft save; token for PATCH and release
    version: integer("version").notNull().default(1),
    status: bomStatusEnum("status").notNull().default("draft"),
    // BR-BOM-04: casting only (indexed below)
    alloyItemId: integer("alloy_item_id").references(() => itemMaster.id),
    netWeightKg: numeric("net_weight_kg", { precision: 10, scale: 3 }),
    shotWeightKg: numeric("shot_weight_kg", { precision: 10, scale: 3 }),
    cavities: smallint("cavities"),
    meltLossPct: numeric("melt_loss_pct", { precision: 4, scale: 2 }),
    castingRejectPct: numeric("casting_reject_pct", {
      precision: 4,
      scale: 2,
    }),
    // BR-BOM-07: job work only (indexed below)
    sentItemId: integer("sent_item_id").references(() => itemMaster.id),
    sendQty: integer("send_qty"),
    returnQty: integer("return_qty"),
    jobWorkerId: integer("job_worker_id").references(() => supplierMaster.id),
    serviceId: integer("service_id").references(() => serviceMaster.id),
    jobWorkLossPct: numeric("job_work_loss_pct", { precision: 4, scale: 2 }),
    // BR-BOM-12: required at release unless the part has no active/retired revision
    changeReason: text("change_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    releasedBy: integer("released_by").references(() => employees.id),
    releasedAt: timestamp("released_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    retiredBy: integer("retired_by").references(() => employees.id),
    retiredAt: timestamp("retired_at"),
    retireReason: text("retire_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    lastUpdatedBy: integer("last_updated_by").references(() => employees.id),
    lastUpdatedAt: timestamp("last_updated_at").defaultNow().notNull(),
  },
  (t) => ({
    // BR-BOM-02; also serves "revisions of a part, newest first" (BR-BOM-25)
    partRevisionUq: unique("uq_boms_part_revision").on(t.partId, t.revisionNo),
    // BR-BOM-14, 17: one active and one draft per part
    oneActiveUq: uniqueIndex("uq_boms_one_active")
      .on(t.partId)
      .where(sql`${t.status} = 'active'`),
    oneDraftUq: uniqueIndex("uq_boms_one_draft")
      .on(t.partId)
      .where(sql`${t.status} = 'draft'`),
    sentItemIdx: index("idx_boms_sent_item_id").on(t.sentItemId),
    alloyItemIdx: index("idx_boms_alloy_item_id").on(t.alloyItemId),
    jobWorkerIdx: index("idx_boms_job_worker_id").on(t.jobWorkerId),
    serviceIdx: index("idx_boms_service_id").on(t.serviceId),
    statusKindIdx: index("idx_boms_status_kind").on(t.status, t.kind),
    releasedAtIdx: index("idx_boms_released_at").on(t.releasedAt),
    cavitiesCk: check(
      "boms_cavities_ck",
      sql`${t.cavities} is null or ${t.cavities} between 1 and 64`,
    ),
    meltLossCk: check(
      "boms_melt_loss_pct_ck",
      sql`${t.meltLossPct} is null or (${t.meltLossPct} >= 0 and ${t.meltLossPct} < 50)`,
    ),
    rejectCk: check(
      "boms_casting_reject_pct_ck",
      sql`${t.castingRejectPct} is null or (${t.castingRejectPct} >= 0 and ${t.castingRejectPct} < 50)`,
    ),
    jobLossCk: check(
      "boms_job_work_loss_pct_ck",
      sql`${t.jobWorkLossPct} is null or (${t.jobWorkLossPct} >= 0 and ${t.jobWorkLossPct} < 50)`,
    ),
    weightsCk: check(
      "boms_weights_positive_ck",
      sql`(${t.netWeightKg} is null or ${t.netWeightKg} > 0) and (${t.shotWeightKg} is null or ${t.shotWeightKg} > 0)`,
    ),
    sendReturnCk: check(
      "boms_send_return_positive_ck",
      sql`(${t.sendQty} is null or ${t.sendQty} > 0) and (${t.returnQty} is null or ${t.returnQty} > 0)`,
    ),
    shotCk: check(
      "boms_shot_covers_net_ck",
      sql`${t.netWeightKg} is null or ${t.shotWeightKg} is null or ${t.cavities} is null or ${t.shotWeightKg} >= ${t.netWeightKg} * ${t.cavities}`,
    ),
    sentNotPartCk: check(
      "boms_sent_item_not_part_ck",
      sql`${t.sentItemId} is null or ${t.sentItemId} <> ${t.partId}`,
    ),
    // BR-BOM-08: casting columns only on casting, job-work columns only on job_work
    kindCastingCk: check(
      "boms_kind_casting_ck",
      sql`${t.kind} = 'casting' or (${t.alloyItemId} is null and ${t.netWeightKg} is null and ${t.shotWeightKg} is null and ${t.cavities} is null and ${t.meltLossPct} is null and ${t.castingRejectPct} is null)`,
    ),
    kindJobWorkCk: check(
      "boms_kind_job_work_ck",
      sql`${t.kind} = 'job_work' or (${t.sentItemId} is null and ${t.sendQty} is null and ${t.returnQty} is null and ${t.jobWorkerId} is null and ${t.serviceId} is null and ${t.jobWorkLossPct} is null)`,
    ),
  }),
);

export const bomLines = pgTable(
  "bom_lines",
  {
    id: serial("id").primaryKey(),
    // only a draft is ever deleted (BR-BOM-15); covered by uq (bom_id, component_item_id)
    bomId: integer("bom_id")
      .references(() => boms.id, { onDelete: "cascade" })
      .notNull(),
    componentItemId: integer("component_item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // BR-BOM-03, 06: per ONE piece, item's own unit, 3 decimals
    qtyPerPiece: numeric("qty_per_piece", {
      precision: 10,
      scale: 3,
    }).notNull(),
    buyAsIs: boolean("buy_as_is").notNull().default(false),
    note: text("note"),
    lineNo: smallint("line_no").notNull(),
  },
  (t) => ({
    // BR-BOM-03: same item twice is refused
    bomComponentUq: unique("uq_bom_lines_bom_component").on(
      t.bomId,
      t.componentItemId,
    ),
    // where-used (BR-BOM-19) and in-use lock (BR-BOM-20)
    componentIdx: index("idx_bom_lines_component_item_id").on(
      t.componentItemId,
    ),
    qtyCk: check("bom_lines_qty_positive_ck", sql`${t.qtyPerPiece} > 0`),
    lineNoCk: check("bom_lines_line_no_ck", sql`${t.lineNo} between 1 and 50`),
  }),
);

// BR-BOM-02, 17: revision counter and per-part lock row
export const bomPartSeq = pgTable("bom_part_seq", {
  partId: integer("part_id")
    .primaryKey()
    .references(() => itemMaster.id),
  lastRevisionNo: integer("last_revision_no").notNull(),
});

// BR-BOM-23: audit rows; no FK on bom_id so they survive a draft delete (BR-BOM-15)
export const bomHistory = pgTable(
  "bom_history",
  {
    id: serial("id").primaryKey(),
    bomId: integer("bom_id").notNull(),
    partId: integer("part_id")
      .references(() => itemMaster.id)
      .notNull(),
    revisionNo: integer("revision_no").notNull(),
    action: bomHistoryActionEnum("action").notNull(),
    changes: jsonb("changes").notNull(),
    reason: text("reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    changedBy: integer("changed_by")
      .references(() => employees.id)
      .notNull(),
    changedAt: timestamp("changed_at").defaultNow().notNull(),
  },
  (t) => ({
    partChangedIdx: index("idx_bom_history_part_changed").on(
      t.partId,
      t.changedAt,
    ),
  }),
);
