import { z } from "zod";
import { searchTermSchema } from "../lib/safe-search";

// Reorder contract types (docs/specs/reorder/design/api.md; BR-RO-01..31).
// Quantities are numbers in the item unit, at most 3 decimals.

export const REORDER_ITEM_STATES = [
  "will_be_ordered",
  "covered",
  "needs_reorder_qty",
  "ok",
] as const;
export const reorderItemStateSchema = z.enum(REORDER_ITEM_STATES);
export type ReorderItemState = z.infer<typeof reorderItemStateSchema>;

export const REORDER_RUN_STATES = ["running", "done", "failed"] as const;
export const reorderRunStateSchema = z.enum(REORDER_RUN_STATES);
export type ReorderRunState = z.infer<typeof reorderRunStateSchema>;

export const REORDER_RUN_TRIGGERS = ["schedule", "manual"] as const;
export const reorderRunTriggerSchema = z.enum(REORDER_RUN_TRIGGERS);

export const REORDER_ITEM_OUTCOMES = [
  "raised",
  "needs_reorder_qty",
  "invalid_line",
  "deferred",
] as const;
export const reorderItemOutcomeSchema = z.enum(REORDER_ITEM_OUTCOMES);

// Comma list of enum values: split, trim, drop duplicates, each entry checked
// against the enum (else 400). Empty string = no filter.
const csvEnum = <T extends readonly [string, ...string[]]>(
  values: T,
  max: number,
) =>
  z
    .string()
    .max(200)
    .optional()
    .transform((value) =>
      value
        ? [
            ...new Set(
              value
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
            ),
          ]
        : undefined,
    )
    .pipe(z.array(z.enum(values)).max(max).optional());

const idRef = z.object({ id: z.number().int(), name: z.string() });

// ---- GET /api/reorder/items ----
export const REORDER_ITEM_SORT_FIELDS = [
  "sku",
  "name",
  "usableQty",
  "projectedQty",
  "state",
] as const;

export const reorderItemsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(REORDER_ITEM_SORT_FIELDS).default("sku"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    // comma list of the four states, at most 4 entries
    state: csvEnum(REORDER_ITEM_STATES, 4),
    q: searchTermSchema,
  })
  .strict();
export type ReorderItemsQuery = z.infer<typeof reorderItemsQuerySchema>;

export const reorderItemRowSchema = z.object({
  itemId: z.number().int(),
  sku: z.string(),
  name: z.string(),
  uom: z.string(),
  usableQty: z.number(),
  onTheWayQty: z.number(),
  projectedQty: z.number(),
  reorderLevel: z.number(),
  reorderQty: z.number(),
  // set only for will_be_ordered (same computeOrderQty as the run)
  orderQty: z.number().nullable(),
  state: reorderItemStateSchema,
  // newest open PR, else PO, that counts as on the way; null unless covered
  coveredBy: z
    .object({
      type: z.enum(["pr", "po"]),
      id: z.number().int(),
      number: z.string(),
    })
    .nullable(),
});
export type ReorderItemRow = z.infer<typeof reorderItemRowSchema>;

// stateCounts ignore the `state` filter (quick filters)
export const reorderStateCountsSchema = z.object({
  will_be_ordered: z.number().int().min(0),
  covered: z.number().int().min(0),
  needs_reorder_qty: z.number().int().min(0),
  ok: z.number().int().min(0),
});

// ---- runs ----
export const REORDER_RUN_SORT_FIELDS = ["startedAt", "id", "state"] as const;

export const reorderRunsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(REORDER_RUN_SORT_FIELDS).default("startedAt"),
    // newest first by default (deliberate)
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    state: csvEnum(REORDER_RUN_STATES, 3),
    trigger: reorderRunTriggerSchema.optional(),
  })
  .strict();
export type ReorderRunsQuery = z.infer<typeof reorderRunsQuerySchema>;

export const reorderRunIdParamSchema = z.object({
  id: z.coerce.number().int().min(1),
});

export const reorderRunSchema = z.object({
  id: z.number().int(),
  trigger: reorderRunTriggerSchema,
  state: reorderRunStateSchema,
  // null = daily schedule
  startedBy: idRef.nullable(),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable(),
  draftOwner: idRef.nullable(),
  itemsChecked: z.number().int(),
  itemsRaised: z.number().int(),
  itemsSkipped: z.number().int(),
  itemsDeferred: z.number().int(),
  pr: z
    .object({
      id: z.number().int(),
      prNumber: z.string(),
      status: z.string(),
    })
    .nullable(),
  // newest PO linked to the PR lines (DocumentFlow)
  po: z
    .object({
      id: z.number().int(),
      poNumber: z.string(),
      status: z.string(),
    })
    .nullable(),
  // fixed whitelist text, never a raw error
  failureReason: z.string().nullable(),
});
export type ReorderRun = z.infer<typeof reorderRunSchema>;

export const reorderRunItemSchema = z.object({
  itemId: z.number().int(),
  sku: z.string(),
  name: z.string(),
  uom: z.string(),
  outcome: reorderItemOutcomeSchema,
  usableQty: z.number(),
  onTheWayQty: z.number(),
  projectedQty: z.number(),
  reorderLevel: z.number(),
  reorderQty: z.number(),
  orderQty: z.number().nullable(),
  prItemId: z.number().int().nullable(),
});

// not paged: at most 500 raised lines plus skipped / deferred rows
export const reorderRunDetailSchema = reorderRunSchema.extend({
  items: z.array(reorderRunItemSchema),
});
export type ReorderRunDetail = z.infer<typeof reorderRunDetailSchema>;

// ---- POST /api/reorder/check-now: no body (an empty {} is accepted) ----
export const reorderCheckNowBodySchema = z.object({}).strict();

// ---- settings ----
export const reorderSettingsSchema = z.object({
  enabled: z.boolean(),
  runHour: z.number().int().min(0).max(23),
  draftOwner: idRef.nullable(),
  // read-only: owner set, active, holds pr.manage now
  draftOwnerValid: z.boolean(),
  updatedBy: idRef.nullable(),
  updatedAt: z.coerce.date(),
});
export type ReorderSettings = z.infer<typeof reorderSettingsSchema>;

export const updateReorderSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    runHour: z.number().int().min(0).max(23).optional(),
    // null clears the owner
    draftOwnerId: z.number().int().min(1).nullable().optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "At least one field is required",
  });
export type UpdateReorderSettingsInput = z.infer<
  typeof updateReorderSettingsSchema
>;

// ---- GET /api/reorder/owner-candidates ----
export const reorderOwnerCandidatesQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["name"]).default("name"),
    sortDir: z.enum(["asc", "desc"]).default("asc"),
    q: searchTermSchema,
  })
  .strict();
export type ReorderOwnerCandidatesQuery = z.infer<
  typeof reorderOwnerCandidatesQuerySchema
>;

export const reorderOwnerCandidateSchema = idRef;
