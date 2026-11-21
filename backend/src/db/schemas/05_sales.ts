import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
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
import { boms } from "./02_procurement-bom";
import { itemMaster } from "./02_procurement-catalog";
import {
  purchaseOrderItems,
  purchaseRequestItems,
  subcontractingOrderItems,
} from "./02_procurement-purchasing";
import { employees } from "./03_hcm";

// Sale order and BOM explosion. design/data.md. Quantities numeric(14,3),
// money bigint paise, plant days `date` (IST).
export const soStatusEnum = pgEnum("so_status", [
  "draft",
  "confirmed",
  "on_hold",
  "closed",
  "cancelled",
]);

// BR-SO-17, 54: how a closed SO was closed
export const soCloseKindEnum = pgEnum("so_close_kind", [
  "manual",
  "fully_delivered",
]);

export const explosionStatusEnum = pgEnum("explosion_status", [
  "current",
  "superseded",
]);

export const explosionRowTypeEnum = pgEnum("explosion_row_type", [
  "cast",
  "job_work",
  "assemble",
  "buy",
]);

export const reservationKindEnum = pgEnum("reservation_kind", [
  "stock",
  "open_pr",
  "open_po",
  "open_sco",
]);

// --- customers (BR-SO-01, 02) ---
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    // 2-digit GST state code; GSTIN prefix must match (API check)
    // no-index: low-card ~30 GST state codes, list filter on a small table
    stateCode: text("state_code").notNull(),
    address: text("address").notNull(),
    gstin: text("gstin"),
    // BR-SO-02: never deleted
    // no-index: low-card two values, list filter on a small table
    isActive: boolean("is_active").notNull().default(true),
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
    // BR-SO-01: unique ignoring case and outer spaces
    nameNormUq: uniqueIndex("uq_customers_name_norm").on(
      sql`lower(btrim(${t.name}))`,
    ),
    // list `q`
    nameTrgm: index("idx_customers_name_trgm").using(
      "gin",
      t.name.op("gin_trgm_ops"),
    ),
    stateCodeCk: check(
      "customers_state_code_ck",
      sql`${t.stateCode} ~ '^[0-9]{2}$'`,
    ),
    gstinCk: check(
      "customers_gstin_ck",
      sql`${t.gstin} is null or ${t.gstin} ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'`,
    ),
  }),
);

// --- sale_orders (BR-SO-05..20) ---
export const saleOrders = pgTable(
  "sale_orders",
  {
    id: serial("id").primaryKey(),
    // BR-SO-05: SO-<IST yyyy-mm>-<seq>, counter docType SO
    soNumber: text("so_number").notNull(),
    customerId: integer("customer_id")
      .references(() => customers.id)
      .notNull(),
    status: soStatusEnum("status").notNull().default("draft"),
    orderDate: date("order_date").notNull(),
    customerPoNumber: text("customer_po_number"),
    customerPoDate: date("customer_po_date"),
    notes: text("notes"),
    // BR-SO-56: null = the customer's address and state
    shipToAddress: text("ship_to_address"),
    shipToStateCode: text("ship_to_state_code"),
    // BR-SO-11: sum of line_amount_paise, rewritten in the edit transaction
    totalAmountPaise: bigint("total_amount_paise", { mode: "number" })
      .notNull()
      .default(0),
    // BR-SO-52: +1 on every write (optimistic check)
    editVersion: integer("edit_version").notNull().default(0),
    // BR-SO-38: +1 only on a change that alters the need
    needVersion: integer("need_version").notNull().default(0),
    // BR-SO-38: +1 only by the dispatch hooks
    deliveryVersion: integer("delivery_version").notNull().default(0),
    // BR-SO-60: line numbers are never reused
    lastLineNo: integer("last_line_no").notNull().default(0),
    // no-index: audit who-did-it column, read only by joining to employees
    confirmedBy: integer("confirmed_by").references(() => employees.id),
    confirmedAt: timestamp("confirmed_at"),
    holdReason: text("hold_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    heldBy: integer("held_by").references(() => employees.id),
    heldAt: timestamp("held_at"),
    // null until closed; fully_delivered only by the dispatch hook
    closeKind: soCloseKindEnum("close_kind"),
    closeReason: text("close_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    closedBy: integer("closed_by").references(() => employees.id),
    closedAt: timestamp("closed_at"),
    cancelReason: text("cancel_reason"),
    // no-index: audit who-did-it column, read only by joining to employees
    cancelledBy: integer("cancelled_by").references(() => employees.id),
    cancelledAt: timestamp("cancelled_at"),
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
    soNumberUq: unique("uq_sale_orders_so_number").on(t.soNumber),
    statusCreatedIdx: index("idx_sale_orders_status_created").on(
      t.status,
      t.createdAt.desc(),
    ),
    customerIdx: index("idx_sale_orders_customer_id").on(t.customerId),
    orderDateIdx: index("idx_sale_orders_order_date").on(t.orderDate.desc()),
    // dispatch pending list: open SOs by order date
    statusOrderDateIdx: index("idx_sale_orders_status_order_date").on(
      t.status,
      t.orderDate,
    ),
    soNumberTrgm: index("idx_sale_orders_so_number_trgm").using(
      "gin",
      t.soNumber.op("gin_trgm_ops"),
    ),
    customerPoTrgm: index("idx_sale_orders_customer_po_trgm").using(
      "gin",
      t.customerPoNumber.op("gin_trgm_ops"),
    ),
    // BR-SO-06: race-safe; cancelled SOs excluded
    customerPoUq: uniqueIndex("uq_sale_orders_customer_po")
      .on(t.customerId, sql`lower(btrim(${t.customerPoNumber}))`)
      .where(
        sql`${t.status} <> 'cancelled' and ${t.customerPoNumber} is not null`,
      ),
    totalCk: check("sale_orders_total_ck", sql`${t.totalAmountPaise} >= 0`),
    shipToCk: check(
      "sale_orders_ship_to_ck",
      sql`${t.shipToAddress} is null or ${t.shipToStateCode} is not null`,
    ),
  }),
);

// --- sale_order_lines (BR-SO-07..14, 57, 60) ---
export const saleOrderLines = pgTable(
  "sale_order_lines",
  {
    id: serial("id").primaryKey(),
    soId: integer("so_id")
      .references(() => saleOrders.id)
      .notNull(),
    lineNo: integer("line_no").notNull(),
    // BR-SO-60: soft remove
    removedAt: timestamp("removed_at"),
    // no-index: audit who-did-it column, read only by joining to employees
    removedBy: integer("removed_by").references(() => employees.id),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // copied from the item master
    uom: text("uom").notNull(),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull(),
    // round(qty x unit price), computed in SQL numeric
    lineAmountPaise: bigint("line_amount_paise", { mode: "number" }).notNull(),
    // BR-SO-57: one of the BR-SUP-13 list (API check)
    gstPercent: numeric("gst_percent", { precision: 5, scale: 2 }).notNull(),
    deliveryDate: date("delivery_date").notNull(),
    // BR-SO-09: written only by the dispatch hook
    deliveredQty: numeric("delivered_qty", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    notes: text("notes"),
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
    // BR-SO-08; its so_id prefix serves the FK
    soItemDateUq: uniqueIndex("uq_sale_order_lines_so_item_date")
      .on(t.soId, t.itemId, t.deliveryDate)
      .where(sql`${t.removedAt} is null`),
    soLineNoUq: unique("uq_sale_order_lines_so_line_no").on(t.soId, t.lineNo),
    itemIdx: index("idx_sale_order_lines_item_id").on(t.itemId),
    // list filter deliveryBefore: open lines only
    openDeliveryIdx: index("idx_sale_order_lines_open_delivery")
      .on(t.deliveryDate)
      .where(sql`${t.removedAt} is null and ${t.deliveredQty} < ${t.qty}`),
    qtyCk: check("sale_order_lines_qty_ck", sql`${t.qty} > 0`),
    priceCk: check(
      "sale_order_lines_price_ck",
      sql`${t.unitPricePaise} >= 0 and ${t.lineAmountPaise} >= 0`,
    ),
    deliveredCk: check(
      "sale_order_lines_delivered_ck",
      sql`${t.deliveredQty} >= 0 and ${t.deliveredQty} <= ${t.qty}`,
    ),
  }),
);

// --- sale_explosions: one numbered snapshot (BR-SO-21, 36, 38) ---
export const saleExplosions = pgTable(
  "sale_explosions",
  {
    id: serial("id").primaryKey(),
    soId: integer("so_id")
      .references(() => saleOrders.id)
      .notNull(),
    // shown <so_number>/E<run_no>
    runNo: integer("run_no").notNull(),
    // no-index: low-card two values, covered by uq_sale_explosions_one_current
    status: explosionStatusEnum("status").notNull().default("current"),
    // sale_orders.need_version / delivery_version at run time (BR-SO-38)
    soNeedVersion: integer("so_need_version").notNull(),
    soDeliveryVersion: integer("so_delivery_version").notNull(),
    // no-index: audit who-did-it column, read only by joining to employees
    createdBy: integer("created_by")
      .references(() => employees.id)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    supersededAt: timestamp("superseded_at"),
  },
  (t) => ({
    // serves the FK
    soRunUq: unique("uq_sale_explosions_so_run").on(t.soId, t.runNo),
    // one current snapshot per SO
    oneCurrentUq: uniqueIndex("uq_sale_explosions_one_current")
      .on(t.soId)
      .where(sql`${t.status} = 'current'`),
  }),
);

// --- sale_explosion_rows: one row per item per snapshot (BR-SO-25) ---
export const saleExplosionRows = pgTable(
  "sale_explosion_rows",
  {
    id: serial("id").primaryKey(),
    explosionId: integer("explosion_id")
      .references(() => saleExplosions.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // 1..10, top item = L1 (BR-SO-50)
    level: smallint("level").notNull(),
    // no-index: low-card four values, always filtered together with explosion_id
    rowType: explosionRowTypeEnum("row_type").notNull(),
    // no_bom | buy_as_is (BR-SO-22, 50)
    tag: text("tag"),
    // inactive_item | no_active_bom | bom_loop (BR-SO-26..28)
    blockReason: text("block_reason"),
    bomRevisionId: integer("bom_revision_id").references(() => boms.id),
    uom: text("uom").notNull(),
    grossQty: numeric("gross_qty", { precision: 14, scale: 3 }).notNull(),
    onHandQty: numeric("on_hand_qty", { precision: 14, scale: 3 }).notNull(),
    reservedOtherQty: numeric("reserved_other_qty", {
      precision: 14,
      scale: 3,
    }).notNull(),
    openPrQty: numeric("open_pr_qty", { precision: 14, scale: 3 }).notNull(),
    openPoQty: numeric("open_po_qty", { precision: 14, scale: 3 }).notNull(),
    openScoQty: numeric("open_sco_qty", { precision: 14, scale: 3 }).notNull(),
    lateSupplyQty: numeric("late_supply_qty", {
      precision: 14,
      scale: 3,
    }).notNull(),
    netQty: numeric("net_qty", { precision: 14, scale: 3 }).notNull(),
    // cast row / job-work row, as returned by the BOM service
    pourQty: numeric("pour_qty", { precision: 14, scale: 3 }),
    sendQty: numeric("send_qty", { precision: 14, scale: 3 }),
    requiredBy: date("required_by").notNull(),
    // BR-SO-46: the document line this row became
    prItemId: integer("pr_item_id").references(() => purchaseRequestItems.id),
    scoItemId: integer("sco_item_id").references(
      () => subcontractingOrderItems.id,
    ),
    raisedQty: numeric("raised_qty", { precision: 14, scale: 3 }),
    // no-index: audit who-did-it column, read only by joining to employees
    raisedBy: integer("raised_by").references(() => employees.id),
    raisedAt: timestamp("raised_at"),
  },
  (t) => ({
    // serves the FK
    explosionItemUq: unique("uq_sale_explosion_rows_explosion_item").on(
      t.explosionId,
      t.itemId,
    ),
    prItemUq: uniqueIndex("uq_sale_explosion_rows_pr_item")
      .on(t.prItemId)
      .where(sql`${t.prItemId} is not null`),
    scoItemUq: uniqueIndex("uq_sale_explosion_rows_sco_item")
      .on(t.scoItemId)
      .where(sql`${t.scoItemId} is not null`),
    itemIdx: index("idx_sale_explosion_rows_item_id").on(t.itemId),
    bomRevisionIdx: index("idx_sale_explosion_rows_bom_revision_id").on(
      t.bomRevisionId,
    ),
    levelCk: check(
      "sale_explosion_rows_level_ck",
      sql`${t.level} between 1 and 10`,
    ),
    netCk: check("sale_explosion_rows_net_ck", sql`${t.netQty} >= 0`),
    oneDocCk: check(
      "sale_explosion_rows_one_doc_ck",
      sql`${t.prItemId} is null or ${t.scoItemId} is null`,
    ),
  }),
);

// --- sale_explosion_sources: which SO line needed the row (BR-SO-25) ---
export const saleExplosionSources = pgTable(
  "sale_explosion_sources",
  {
    id: serial("id").primaryKey(),
    rowId: integer("row_id")
      .references(() => saleExplosionRows.id)
      .notNull(),
    soLineId: integer("so_line_id")
      .references(() => saleOrderLines.id)
      .notNull(),
    // parent item at the level above; null at level 1
    // no-index: pk-join read only by joining to item_master with its row
    viaItemId: integer("via_item_id").references(() => itemMaster.id),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
  },
  (t) => ({
    rowIdx: index("idx_sale_explosion_sources_row_id").on(t.rowId),
    soLineIdx: index("idx_sale_explosion_sources_so_line_id").on(t.soLineId),
    qtyCk: check("sale_explosion_sources_qty_ck", sql`${t.qty} > 0`),
  }),
);

// --- sale_reservations: soft claims, never ledger postings (BR-SO-34, 35) ---
export const saleReservations = pgTable(
  "sale_reservations",
  {
    id: serial("id").primaryKey(),
    rowId: integer("row_id")
      .references(() => saleExplosionRows.id)
      .notNull(),
    // denormalised: release on close / cancel / re-run without a join
    soId: integer("so_id")
      .references(() => saleOrders.id)
      .notNull(),
    itemId: integer("item_id")
      .references(() => itemMaster.id)
      .notNull(),
    // no-index: low-card four values, covered by idx_sale_reservations_stock_item
    kind: reservationKindEnum("kind").notNull(),
    prItemId: integer("pr_item_id").references(() => purchaseRequestItems.id),
    poItemId: integer("po_item_id").references(() => purchaseOrderItems.id),
    scoItemId: integer("sco_item_id").references(
      () => subcontractingOrderItems.id,
    ),
    qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
    // set on supersede, close, cancel; row kept for trace
    releasedAt: timestamp("released_at"),
  },
  (t) => ({
    rowIdx: index("idx_sale_reservations_row_id").on(t.rowId),
    // BR-SO-30: free stock per item
    stockItemIdx: index("idx_sale_reservations_stock_item")
      .on(t.itemId)
      .where(sql`${t.kind} = 'stock' and ${t.releasedAt} is null`),
    // BR-SO-33: supply claimed by others
    prItemIdx: index("idx_sale_reservations_pr_item")
      .on(t.prItemId)
      .where(sql`${t.releasedAt} is null`),
    poItemIdx: index("idx_sale_reservations_po_item")
      .on(t.poItemId)
      .where(sql`${t.releasedAt} is null`),
    scoItemIdx: index("idx_sale_reservations_sco_item")
      .on(t.scoItemId)
      .where(sql`${t.releasedAt} is null`),
    // release on close / cancel / re-run
    soIdx: index("idx_sale_reservations_so_id")
      .on(t.soId)
      .where(sql`${t.releasedAt} is null`),
    qtyCk: check("sale_reservations_qty_ck", sql`${t.qty} > 0`),
    kindRefCk: check(
      "sale_reservations_kind_ref_ck",
      sql`(${t.kind} = 'stock' and ${t.prItemId} is null and ${t.poItemId} is null and ${t.scoItemId} is null)
        or (${t.kind} = 'open_pr' and ${t.prItemId} is not null and ${t.poItemId} is null and ${t.scoItemId} is null)
        or (${t.kind} = 'open_po' and ${t.poItemId} is not null and ${t.prItemId} is null and ${t.scoItemId} is null)
        or (${t.kind} = 'open_sco' and ${t.scoItemId} is not null and ${t.prItemId} is null and ${t.poItemId} is null)`,
    ),
  }),
);

// --- sales_audit_log: insert-only (BR-SO-52) ---
export const salesAuditLog = pgTable(
  "sales_audit_log",
  {
    id: serial("id").primaryKey(),
    actorId: integer("actor_id")
      .references(() => employees.id)
      .notNull(),
    // no-index: low-card few action names, filtered together with so_id
    action: text("action").notNull(),
    // customer | sale_order | explosion
    targetType: text("target_type").notNull(),
    targetId: integer("target_id").notNull(),
    soId: integer("so_id").references(() => saleOrders.id),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at").defaultNow().notNull(),
  },
  (t) => ({
    soAtIdx: index("idx_sales_audit_log_so_at").on(t.soId, t.at.desc()),
    targetIdx: index("idx_sales_audit_log_target").on(
      t.targetType,
      t.targetId,
      t.at.desc(),
    ),
    actorIdx: index("idx_sales_audit_log_actor_id").on(t.actorId),
  }),
);
