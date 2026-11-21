import { z } from "zod";
import {
  explosionRowTypeEnum,
  explosionStatusEnum,
  soCloseKindEnum,
  soStatusEnum,
} from "../db/schemas/05_sales";
import { searchTermSchema } from "../lib/safe-search";
import { SUPPLIER_GST_SLABS } from "./supplier.types";

// Sale order and explosion contract types (design/api.md). Quantities travel
// as JSON numbers with at most 3 decimals; the service does the exact maths.
// Date-window checks (today-based, IST) are service rules; Zod checks format.

export const soStatusSchema = z.enum(soStatusEnum.enumValues);
export const soCloseKindSchema = z.enum(soCloseKindEnum.enumValues);
export const explosionStatusSchema = z.enum(explosionStatusEnum.enumValues);
export const explosionRowTypeSchema = z.enum(explosionRowTypeEnum.enumValues);
export type SoStatus = z.infer<typeof soStatusSchema>;

export const SNAPSHOT_STATUSES = [
  "current",
  "out_of_date",
  "superseded",
  "none",
] as const;
export const OUT_OF_DATE_REASONS = [
  "so_changed",
  "bom_changed",
  "delivery_changed",
] as const;
export const ROW_TAGS = ["no_bom", "buy_as_is"] as const;
export const ROW_BLOCK_REASONS = [
  "inactive_item",
  "no_active_bom",
  "bom_loop",
] as const;
export const SO_MAX_LINES = 200;
export const EXPLOSION_MAX_ROWS = 200;

// --- Shared field rules ---

const idSchema = z.number().int().positive();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Invalid date");
const text = (max: number) => z.string().trim().min(1).max(max);
const reasonSchema = z.string().trim().min(3).max(500); // BR-SO-16..18, 61
const stateCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}$/);

/** Number in (min, max] with at most `decimals` decimals; whole-unit rule is the service's. */
const qtySchema = z
  .number()
  .gt(0)
  .max(1_000_000)
  .refine((v) => Math.abs(Math.round(v * 1000) - v * 1000) < 1e-6, {
    message: "At most 3 decimal places",
  });
const pricePaiseSchema = z.number().int().min(0).max(100_000_000);
const gstPercentSchema = z
  .number()
  .min(0)
  .max(40)
  .refine((v) => (SUPPLIER_GST_SLABS as readonly number[]).includes(v), {
    message: "GST % must be one of 0, 0.1, 0.25, 1.5, 3, 5, 12, 18, 28, 40",
  });
const editVersionSchema = z.number().int().min(0);

// --- Requests: create / edit (BR-SO-05..14, 56, 57, 59) ---

export const soLineInputSchema = z
  .object({
    itemId: idSchema,
    qty: qtySchema,
    unitPricePaise: pricePaiseSchema,
    gstPercent: gstPercentSchema,
    deliveryDate: dateSchema,
    notes: text(500).optional(),
  })
  .strict();

const soHeaderShape = {
  customerPoNumber: text(50).optional(),
  customerPoDate: dateSchema.optional(),
  shipToAddress: text(300).optional(),
  shipToStateCode: stateCodeSchema.optional(),
  notes: text(1000).optional(),
};

const shipToPair = (v: {
  shipToAddress?: string | undefined;
  shipToStateCode?: string | undefined;
}) => !v.shipToAddress || v.shipToStateCode !== undefined;
const SHIP_TO_MESSAGE = {
  message: "shipToStateCode is required when shipToAddress is set",
  path: ["shipToStateCode"],
};

// POST /api/sale-orders. `status` / `deliveredQty` are not accepted: .strict()
// turns them into a 400 (BR-SO-09, 10).
export const createSaleOrderSchema = z
  .object({
    customerId: idSchema,
    orderDate: dateSchema,
    ...soHeaderShape,
    lines: z.array(soLineInputSchema).min(1).max(SO_MAX_LINES),
  })
  .strict()
  .refine(shipToPair, SHIP_TO_MESSAGE);
export type CreateSaleOrderInput = z.infer<typeof createSaleOrderSchema>;

// An existing line (`id`) is updated; `itemId` is allowed only on draft SOs
// and on new lines (BR-SO-13). A line without `id` is added and needs itemId.
export const soLineEditSchema = z
  .object({
    id: idSchema.optional(),
    itemId: idSchema.optional(),
    qty: qtySchema,
    unitPricePaise: pricePaiseSchema,
    gstPercent: gstPercentSchema,
    deliveryDate: dateSchema,
    notes: text(500).nullable().optional(),
  })
  .strict();

// PATCH /api/sale-orders/:id (BR-SO-10, 13, 14, 59, 60). A header text field
// sent as null clears it.
export const updateSaleOrderSchema = z
  .object({
    editVersion: editVersionSchema,
    customerId: idSchema.optional(),
    orderDate: dateSchema.optional(),
    customerPoNumber: text(50).nullable().optional(),
    customerPoDate: dateSchema.nullable().optional(),
    shipToAddress: text(300).nullable().optional(),
    shipToStateCode: stateCodeSchema.nullable().optional(),
    notes: text(1000).nullable().optional(),
    lines: z.array(soLineEditSchema).max(SO_MAX_LINES).optional(),
    removeLineIds: z.array(idSchema).max(SO_MAX_LINES).optional(),
  })
  .strict()
  .refine(
    (v) =>
      Object.keys(v).some(
        (k) => k !== "editVersion" && v[k as keyof typeof v] !== undefined,
      ),
    { message: "At least one field besides editVersion is required" },
  );
export type UpdateSaleOrderInput = z.infer<typeof updateSaleOrderSchema>;

// POST …/confirm and …/resume
export const soVersionBodySchema = z.object({ editVersion: editVersionSchema });
export type SoVersionBody = z.infer<typeof soVersionBodySchema>;

// POST …/hold, …/close, …/cancel
export const soReasonBodySchema = z.object({
  reason: reasonSchema,
  editVersion: editVersionSchema,
});
export type SoReasonBody = z.infer<typeof soReasonBodySchema>;

// POST …/explosions (no body fields)
export const runExplosionSchema = z.object({}).strict();

// POST …/explosions/:eid/drafts (BR-SO-39..48)
export const createDraftsSchema = z
  .object({
    rows: z
      .array(
        z.object({
          rowId: idSchema,
          qty: qtySchema,
          vendorId: idSchema.optional(),
          expectedReturnDate: dateSchema.optional(),
        }),
      )
      .min(1)
      .max(EXPLOSION_MAX_ROWS),
  })
  .refine((v) => new Set(v.rows.map((r) => r.rowId)).size === v.rows.length, {
    message: "rowId must not repeat",
    path: ["rows"],
  });
export type CreateDraftsInput = z.infer<typeof createDraftsSchema>;

// --- Requests: params and queries ---

export const soIdParamSchema = z.object({ id: z.coerce.number().int().min(1) });
export const soExplosionParamSchema = z.object({
  id: z.coerce.number().int().min(1),
  eid: z.coerce.number().int().min(1),
});

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
};

export const SO_LIST_SORT_FIELDS = [
  "soNumber",
  "orderDate",
  "createdAt",
  "totalAmountPaise",
] as const;
// GET /api/sale-orders. `status` is a CSV; an unknown value is a 400.
export const soListQuerySchema = z.object({
  ...pageQuery,
  sortBy: z.enum(SO_LIST_SORT_FIELDS).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  q: searchTermSchema,
  status: z
    .string()
    .max(100)
    .optional()
    .transform((v) =>
      v
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(soStatusSchema).min(1).max(5).optional()),
  customerId: z.coerce.number().int().min(1).optional(),
  orderDateFrom: dateSchema.optional(),
  orderDateTo: dateSchema.optional(),
  deliveryBefore: dateSchema.optional(),
});
export type SoListQuery = z.infer<typeof soListQuerySchema>;

export const SO_AUDIT_SORT_FIELDS = ["at"] as const;
export const soAuditQuerySchema = z.object({
  ...pageQuery,
  sortBy: z.enum(SO_AUDIT_SORT_FIELDS).default("at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  action: z.string().trim().min(1).max(60).optional(),
});

export const EXPLOSION_LIST_SORT_FIELDS = ["runNo", "createdAt"] as const;
export const explosionListQuerySchema = z.object({
  ...pageQuery,
  sortBy: z.enum(EXPLOSION_LIST_SORT_FIELDS).default("runNo"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  status: explosionStatusSchema.optional(),
});

export const EXPLOSION_ROW_SORT_FIELDS = [
  "level",
  "sku",
  "netQty",
  "type",
] as const;
export const explosionRowsQuerySchema = z.object({
  ...pageQuery,
  sortBy: z.enum(EXPLOSION_ROW_SORT_FIELDS).default("level"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  type: explosionRowTypeSchema.optional(),
  net: z.enum(["short"]).optional(),
  flagged: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});
export type ExplosionRowsQuery = z.infer<typeof explosionRowsQuerySchema>;

// --- Responses ---

export const soLineSchema = z.object({
  id: z.number().int(),
  lineNo: z.number().int(),
  itemId: z.number().int(),
  sku: z.string(),
  itemName: z.string(),
  uom: z.string(),
  qty: z.number(),
  unitPricePaise: z.number().int(),
  lineAmountPaise: z.number().int(),
  gstPercent: z.number(),
  deliveryDate: z.string(),
  deliveredQty: z.number(),
  openQty: z.number(),
  notes: z.string().nullable(),
});

export const raisedDocumentSchema = z.object({
  type: z.enum(["pr", "sco"]),
  id: z.number().int(),
  number: z.string(),
  status: z.string(),
  runNo: z.number().int(),
});

export const currentSnapshotSummarySchema = z.object({
  id: z.number().int(),
  runNo: z.number().int(),
  number: z.string(),
  outOfDate: z.boolean(),
  rowCount: z.number().int(),
  flaggedCount: z.number().int(),
  createdAt: z.string(),
});

// Detail (and the response of every SO write route except create-explosion).
export const saleOrderDetailSchema = z.object({
  id: z.number().int(),
  soNumber: z.string(),
  customerId: z.number().int(),
  customerName: z.string(),
  status: soStatusSchema,
  orderDate: z.string(),
  customerPoNumber: z.string().nullable(),
  customerPoDate: z.string().nullable(),
  shipToAddress: z.string().nullable(),
  shipToStateCode: z.string().nullable(),
  notes: z.string().nullable(),
  totalAmountPaise: z.number().int(),
  editVersion: z.number().int(),
  closeKind: soCloseKindSchema.nullable(),
  holdReason: z.string().nullable(),
  closeReason: z.string().nullable(),
  cancelReason: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  createdByName: z.string(),
  createdAt: z.string(),
  lastUpdatedAt: z.string(),
  lines: z.array(soLineSchema),
  raisedDocuments: z.array(raisedDocumentSchema),
  currentSnapshot: currentSnapshotSummarySchema.nullable(),
});

export const saleOrderListRowSchema = z.object({
  id: z.number().int(),
  soNumber: z.string(),
  customerId: z.number().int(),
  customerName: z.string(),
  customerPoNumber: z.string().nullable(),
  status: soStatusSchema,
  orderDate: z.string(),
  totalAmountPaise: z.number().int(),
  nextDeliveryDate: z.string().nullable(),
  snapshotStatus: z.enum(SNAPSHOT_STATUSES),
  createdAt: z.string(),
});

export const soStatusCountsSchema = z.object({
  draft: z.number().int(),
  confirmed: z.number().int(),
  on_hold: z.number().int(),
  closed: z.number().int(),
  cancelled: z.number().int(),
});

export const soAuditRowSchema = z.object({
  id: z.number().int(),
  actorId: z.number().int(),
  actorName: z.string(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.number().int(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  at: z.string(),
});

export const runExplosionResultSchema = z.object({
  id: z.number().int(),
  runNo: z.number().int(),
  number: z.string(),
  createdAt: z.string(),
  rowCount: z.number().int(),
  flaggedCount: z.number().int(),
});

export const explosionListRowSchema = z.object({
  id: z.number().int(),
  runNo: z.number().int(),
  number: z.string(),
  status: explosionStatusSchema,
  outOfDate: z.boolean(),
  createdByName: z.string(),
  createdAt: z.string(),
  supersededAt: z.string().nullable(),
  rowCount: z.number().int(),
  flaggedCount: z.number().int(),
});

export const explosionHeaderSchema = z.object({
  id: z.number().int(),
  runNo: z.number().int(),
  number: z.string(),
  status: explosionStatusSchema,
  outOfDate: z.boolean(),
  outOfDateReasons: z.array(z.enum(OUT_OF_DATE_REASONS)),
  createdBy: z.number().int(),
  createdByName: z.string(),
  createdAt: z.string(),
  supersededAt: z.string().nullable(),
  totals: z.object({
    rowCount: z.number().int(),
    flaggedCount: z.number().int(),
    shortCount: z.number().int(),
    raisedCount: z.number().int(),
  }),
  bomRevisions: z.array(
    z.object({ partSku: z.string(), revision: z.string() }),
  ),
});

export const explosionRowSchema = z.object({
  id: z.number().int(),
  itemId: z.number().int(),
  sku: z.string(),
  name: z.string(),
  level: z.number().int(),
  type: explosionRowTypeSchema,
  tag: z.enum(ROW_TAGS).nullable(),
  blockReason: z.enum(ROW_BLOCK_REASONS).nullable(),
  bomRevision: z.string().nullable(),
  bomRevisionId: z.number().int().nullable(),
  uom: z.string(),
  grossQty: z.number(),
  onHandQty: z.number(),
  reservedOtherQty: z.number(),
  freeQty: z.number(),
  openPrQty: z.number(),
  openPoQty: z.number(),
  openScoQty: z.number(),
  lateSupplyQty: z.number(),
  netQty: z.number(),
  pourQty: z.number().nullable(),
  sendQty: z.number().nullable(),
  requiredBy: z.string(),
  pastDue: z.boolean(),
  selectable: z.boolean(),
  raised: z
    .object({
      type: z.enum(["pr", "sco"]),
      docId: z.number().int(),
      docNumber: z.string(),
      qty: z.number(),
      at: z.string(),
    })
    .nullable(),
  sources: z.array(
    z.object({
      soLineId: z.number().int(),
      lineNo: z.number().int(),
      qty: z.number(),
      sourceSku: z.string(),
      sourceLevel: z.number().int(),
    }),
  ),
  jobWorker: z
    .object({
      defaultVendorId: z.number().int().nullable(),
      serviceId: z.number().int().nullable(),
      candidates: z.array(
        z.object({ vendorId: z.number().int(), name: z.string() }),
      ),
    })
    .nullable(),
});

export const createDraftsResultSchema = z.object({
  prs: z.array(
    z.object({
      id: z.number().int(),
      prNumber: z.string(),
      lineCount: z.number().int(),
    }),
  ),
  scos: z.array(z.object({ id: z.number().int(), scoNumber: z.string() })),
  rows: z.array(
    z.object({
      rowId: z.number().int(),
      prItemId: z.number().int().nullable(),
      scoItemId: z.number().int().nullable(),
      stillShortBy: z.number(),
    }),
  ),
});
