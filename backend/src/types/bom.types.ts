import { z } from "zod";
import {
  bomHistoryActionEnum,
  bomKindEnum,
  bomStatusEnum,
} from "../db/schemas/02_procurement-bom";
import { searchTermSchema } from "../lib/safe-search";

// BOM contract types (design/api.md). Decimals travel as JSON numbers with at
// most the stated decimals; the service does exact scaled-integer maths.

export const bomKindSchema = z.enum(bomKindEnum.enumValues);
export const bomStatusSchema = z.enum(bomStatusEnum.enumValues);
export const bomHistoryActionSchema = z.enum(bomHistoryActionEnum.enumValues);
export type BomKind = z.infer<typeof bomKindSchema>;
export type BomStatus = z.infer<typeof bomStatusSchema>;

// BR-BOM-18 / tree: how a row is made or bought.
export const BOM_TREATMENTS = [
  "cast",
  "job_work",
  "assemble",
  "buy",
  "buy_as_is",
  "no_bom",
  "loop",
] as const;
export const bomTreatmentSchema = z.enum(BOM_TREATMENTS);
export type BomTreatment = z.infer<typeof bomTreatmentSchema>;

export const BOM_NEXT_STEPS = [
  "create",
  "release",
  "waiting_for_release",
  "start_revision",
  "open_draft",
  "open_active",
  "none",
] as const;

// --- Shared number helpers ---

/** Number within [min, max] with at most `decimals` decimal places. */
function decimalSchema(min: number, max: number, decimals: number) {
  const scale = 10 ** decimals;
  return z
    .number()
    .min(min)
    .max(max)
    .refine((v) => Math.abs(Math.round(v * scale) - v * scale) < 1e-6, {
      message: `At most ${decimals} decimal places`,
    });
}

const idSchema = z.number().int().positive();
const weightKgSchema = decimalSchema(0.001, 1000, 3); // BR-BOM-04
const pctSchema = decimalSchema(0, 49.99, 2); // BR-BOM-04, 07
const reasonSchema = z.string().trim().min(3).max(500); // BR-BOM-12, 16

// --- Requests: draft body (BR-BOM-03, 04, 07, 08) ---

// A draft may be saved half-filled, so every field is optional here; the
// service checks completeness at release (BR-BOM-12).
export const bomCastingInputSchema = z.object({
  alloyItemId: idSchema.optional(),
  netWeightKg: weightKgSchema.optional(),
  shotWeightKg: weightKgSchema.optional(),
  cavities: z.number().int().min(1).max(64).optional(),
  meltLossPct: pctSchema.optional(),
  castingRejectPct: pctSchema.optional(),
});

export const bomJobWorkInputSchema = z.object({
  sentItemId: idSchema.optional(),
  sendQty: z.number().int().min(1).max(1000).optional(),
  returnQty: z.number().int().min(1).max(1000).optional(),
  jobWorkerId: idSchema.optional(),
  serviceId: idSchema.optional(),
  jobWorkLossPct: pctSchema.optional(),
});

export const bomLineInputSchema = z.object({
  componentItemId: idSchema,
  qtyPerPiece: decimalSchema(0.001, 100_000, 3),
  buyAsIs: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

export const bomLinesInputSchema = z.array(bomLineInputSchema).max(50);

// POST /api/bom
export const createBomSchema = z.object({
  partId: idSchema,
  kind: bomKindSchema,
  casting: bomCastingInputSchema.optional(),
  jobWork: bomJobWorkInputSchema.optional(),
  lines: bomLinesInputSchema.default([]),
});
export type CreateBomInput = z.infer<typeof createBomSchema>;

// PATCH /api/bom/:id: same shape, full replace, plus the version token (BR-BOM-11).
export const updateBomSchema = z.object({
  version: z.number().int().min(1),
  kind: bomKindSchema,
  casting: bomCastingInputSchema.optional(),
  jobWork: bomJobWorkInputSchema.optional(),
  lines: bomLinesInputSchema,
});
export type UpdateBomInput = z.infer<typeof updateBomSchema>;

// POST /api/bom/:id/release (BR-BOM-12)
export const releaseBomSchema = z.object({
  version: z.number().int().min(1),
  reason: reasonSchema.optional(),
});
export type ReleaseBomInput = z.infer<typeof releaseBomSchema>;

// POST /api/bom/:id/retire (BR-BOM-16)
export const retireBomSchema = z.object({ reason: reasonSchema });
export type RetireBomInput = z.infer<typeof retireBomSchema>;

// --- Requests: params and queries ---

export const bomIdParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});
export const bomPartIdParamSchema = z.object({
  partId: z.coerce.number().int().min(1),
});
export const bomItemIdParamSchema = z.object({
  itemId: z.coerce.number().int().min(1),
});

const pageQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
};

export const BOM_LIST_SORT_FIELDS = [
  "partSku",
  "partName",
  "revisionNo",
  "kind",
  "status",
  "releasedAt",
  "createdAt",
] as const;

// GET /api/bom (BR-BOM-25). `status` is a comma list; when absent the service
// uses active+draft, or all three if `partId` is given.
export const bomListQuerySchema = z.object({
  ...pageQuery,
  sortBy: z.enum(BOM_LIST_SORT_FIELDS).optional(),
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
    .pipe(z.array(bomStatusSchema).min(1).max(3).optional()),
  kind: bomKindSchema.optional(),
  q: searchTermSchema,
  partId: z.coerce.number().int().min(1).optional(),
});
export type BomListQuery = z.infer<typeof bomListQuerySchema>;

export const BOM_WHERE_USED_SORT_FIELDS = ["partSku", "revisionNo"] as const;
export const bomWhereUsedQuerySchema = z.object({
  ...pageQuery,
  sortBy: z.enum(BOM_WHERE_USED_SORT_FIELDS).optional(),
});

export const BOM_HISTORY_SORT_FIELDS = ["changedAt"] as const;
export const bomHistoryQuerySchema = z.object({
  ...pageQuery,
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  sortBy: z.enum(BOM_HISTORY_SORT_FIELDS).optional(),
});

// GET /api/bom/needs (BR-BOM-18)
export const bomNeedsQuerySchema = z.object({
  partId: z.coerce.number().int().min(1),
  qty: z.coerce.number().int().min(1).max(1_000_000),
  levels: z.enum(["all", "1"]).default("all"),
});
export type BomNeedsQuery = z.infer<typeof bomNeedsQuerySchema>;

// --- Responses ---

// Every write route returns only this (a write-only role sees no BOM content).
export const bomWriteResultSchema = z.object({
  id: z.number().int(),
  status: bomStatusSchema,
  version: z.number().int(),
});
export const bomReleaseResultSchema = bomWriteResultSchema.extend({
  retiredPreviousId: z.number().int().nullable(),
});
export const bomDeleteResultSchema = z.object({
  id: z.number().int(),
  deleted: z.literal(true),
});

// List row (BR-BOM-25). `number` is BOM-<sku>-<letter>, derived in code.
export const bomListRowSchema = z.object({
  id: z.number().int(),
  number: z.string(),
  partId: z.number().int(),
  partSku: z.string(),
  partName: z.string(),
  kind: bomKindSchema,
  status: bomStatusSchema,
  revision: z.string(),
  releasedAt: z.date().nullable(),
});

const itemRefSchema = {
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  inactive: z.boolean(), // BR-BOM-21
};

export const bomCastingDetailSchema = z.object({
  alloyItemId: z.number().int().nullable(),
  alloy: z.object(itemRefSchema).nullable(),
  netWeightKg: z.number().nullable(),
  shotWeightKg: z.number().nullable(),
  cavities: z.number().int().nullable(),
  meltLossPct: z.number().nullable(),
  castingRejectPct: z.number().nullable(),
  // BR-BOM-05: computed, never stored; null while inputs are missing
  computed: z.object({
    pouredWeightKg: z.number().nullable(),
    yieldPct: z.number().nullable(),
    alloyPerGoodPieceKg: z.number().nullable(),
  }),
});

export const bomJobWorkDetailSchema = z.object({
  sentItemId: z.number().int().nullable(),
  sentItem: z.object(itemRefSchema).nullable(),
  sendQty: z.number().int().nullable(),
  returnQty: z.number().int().nullable(),
  jobWorkerId: z.number().int().nullable(),
  jobWorkerName: z.string().nullable(),
  jobWorkerInactive: z.boolean().nullable(),
  serviceId: z.number().int().nullable(),
  serviceName: z.string().nullable(),
  serviceInactive: z.boolean().nullable(),
  jobWorkLossPct: z.number().nullable(),
});

export const bomLineDetailSchema = z.object({
  id: z.number().int(),
  lineNo: z.number().int(),
  componentItemId: z.number().int(),
  ...itemRefSchema,
  qtyPerPiece: z.number(),
  buyAsIs: z.boolean(),
  note: z.string().nullable(),
});

// GET /api/bom/:id (BR-BOM-05, 21, 23, 24)
export const bomDetailSchema = z.object({
  id: z.number().int(),
  number: z.string(),
  partId: z.number().int(),
  part: z.object(itemRefSchema),
  revisionNo: z.number().int(),
  revision: z.string(),
  kind: bomKindSchema,
  status: bomStatusSchema,
  version: z.number().int(),
  casting: bomCastingDetailSchema.nullable(),
  jobWork: bomJobWorkDetailSchema.nullable(),
  lines: z.array(bomLineDetailSchema),
  changeReason: z.string().nullable(),
  releasedByName: z.string().nullable(),
  releasedAt: z.date().nullable(),
  retiredByName: z.string().nullable(),
  retiredAt: z.date().nullable(),
  retireReason: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.date(),
  lastUpdatedByName: z.string().nullable(),
  lastUpdatedAt: z.date(),
  // BR-BOM-24: computed from the caller's permissions
  nextStep: z.enum(BOM_NEXT_STEPS),
  nextRevision: z.string().nullable(),
  activeBomId: z.number().int().nullable(),
  // BR-BOM-24: the part's open draft, for "Open draft <rev>"
  openDraftId: z.number().int().nullable(),
  openDraftRevision: z.string().nullable(),
});

// GET /api/bom/:id/tree: recursive, so the type is declared by hand.
export type BomTreeNode = {
  itemId: number;
  sku: string;
  name: string;
  kind?: BomKind | undefined;
  unit: string;
  qtyPerPiece: number;
  treatment: BomTreatment;
  bomId?: number | undefined;
  revision?: string | undefined;
  inactive: boolean;
  children: BomTreeNode[];
};
export const bomTreeNodeSchema: z.ZodType<BomTreeNode> = z.lazy(() =>
  z.object({
    itemId: z.number().int(),
    sku: z.string(),
    name: z.string(),
    kind: bomKindSchema.optional(),
    unit: z.string(),
    qtyPerPiece: z.number(),
    treatment: bomTreatmentSchema,
    bomId: z.number().int().optional(),
    revision: z.string().optional(),
    inactive: z.boolean(),
    children: z.array(bomTreeNodeSchema),
  }),
);

// GET /api/bom/:id/change-summary (BR-BOM-12, 13)
export const bomChangeSummarySchema = z.object({
  bomId: z.number().int(),
  version: z.number().int(),
  against: z.object({ id: z.number().int(), revision: z.string() }).nullable(),
  firstRevision: z.boolean(),
  header: z.array(
    z.object({
      field: z.string(),
      old: z.unknown().nullable(),
      new: z.unknown().nullable(),
    }),
  ),
  lines: z.object({
    added: z.array(bomLineInputSchema),
    removed: z.array(bomLineInputSchema),
    changed: z.array(
      z.object({
        componentItemId: z.number().int(),
        qtyOld: z.number(),
        qtyNew: z.number(),
        buyAsIsOld: z.boolean(),
        buyAsIsNew: z.boolean(),
      }),
    ),
  }),
  canRelease: z.boolean(),
  problems: z.array(
    z.object({
      code: z.string(),
      field: z.string().optional(),
      message: z.string(),
    }),
  ),
});

// GET /api/bom/needs (BR-BOM-18): one row shape for HTTP and the service.
export const bomNeedsRowSchema = z.object({
  index: z.number().int(),
  parentIndex: z.number().int().nullable(),
  level: z.number().int(),
  path: z.array(z.number().int()),
  itemId: z.number().int(),
  sku: z.string(),
  unit: z.string(),
  qty: z.number(),
  treatment: bomTreatmentSchema,
  partItemId: z.number().int().optional(),
  kind: bomKindSchema.optional(),
  inactive: z.boolean(),
  hasActiveBom: z.boolean(),
  bomId: z.number().int().optional(),
  revision: z.string().optional(),
  pourQty: z.number().optional(),
  alloyItemId: z.number().int().optional(),
  alloyKg: z.number().optional(),
  sendQty: z.number().optional(),
  returnQty: z.number().optional(),
  jobWorkerId: z.number().int().optional(),
  serviceId: z.number().int().optional(),
  jobWorkLossPct: z.number().optional(),
});
export type BomNeedsRow = z.infer<typeof bomNeedsRowSchema>;

export const bomNeedsResponseSchema = z.object({
  partId: z.number().int(),
  qty: z.number().int(),
  rootBomId: z.number().int(),
  revision: z.string(),
  rows: z.array(bomNeedsRowSchema),
  toBuy: z.array(
    z.object({
      itemId: z.number().int(),
      sku: z.string(),
      unit: z.string(),
      qty: z.number(),
      noBom: z.boolean(),
    }),
  ),
});

// GET /api/bom/items/:itemId/where-used (BR-BOM-19)
export const bomWhereUsedRowSchema = z.object({
  bomId: z.number().int(),
  number: z.string(),
  partId: z.number().int(),
  partSku: z.string(),
  partName: z.string(),
  revision: z.string(),
  role: z.enum(["line", "sent_item", "alloy"]),
  qtyPerPiece: z.number(),
  buyAsIs: z.boolean().nullable(),
  returnQty: z.number().int().nullable(),
});

// The item asked about, so the retire dialog can name it (top-level `part`, next to data / meta).
export const bomWhereUsedPartSchema = z.object({
  id: z.number().int(),
  sku: z.string(),
  name: z.string(),
});

// GET /api/bom/parts/:partId/history (BR-BOM-23)
export const bomHistoryRowSchema = z.object({
  id: z.number().int(),
  action: bomHistoryActionSchema,
  revision: z.string(),
  changes: z.unknown(),
  reason: z.string().nullable(),
  changedBy: z.object({ id: z.number().int(), name: z.string() }),
  changedAt: z.date(),
});
