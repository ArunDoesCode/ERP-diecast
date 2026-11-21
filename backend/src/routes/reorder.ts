import { Hono } from "hono";

import { reorderController } from "../controller/reorderController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import {
  paginatedResponse,
  paginationMetaSchema,
  successResponse,
} from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  REORDER_ITEM_SORT_FIELDS,
  REORDER_RUN_SORT_FIELDS,
  reorderCheckNowBodySchema,
  reorderItemRowSchema,
  reorderItemsQuerySchema,
  reorderOwnerCandidateSchema,
  reorderOwnerCandidatesQuerySchema,
  reorderRunDetailSchema,
  reorderRunIdParamSchema,
  reorderRunSchema,
  reorderRunsQuerySchema,
  reorderSettingsSchema,
  reorderStateCountsSchema,
  updateReorderSettingsSchema,
} from "../types/reorder.types";
import { END_POINTS } from "./end-points";

const REORDER_ROUTES = END_POINTS.reorder;
const REORDER_BASE_PATH = "/api/reorder";
const fullPath = (path: string) => `${REORDER_BASE_PATH}${path}`;

const reorderRouter = new Hono<AppEnv>();

reorderRouter.get(
  REORDER_ROUTES.items,
  requirePermission("inventory.view"),
  asyncHandler(reorderController.items),
);
register({
  method: "GET",
  path: fullPath(REORDER_ROUTES.items),
  tags: ["reorder"],
  summary:
    "Live low-stock list, saves nothing (BR-RO-01..08, 21). Rows carry state will_be_ordered | covered | needs_reorder_qty | ok; meta.stateCounts ignore the state filter.",
  auth: { type: "permission", key: "inventory.view" },
  request: { query: reorderItemsQuerySchema },
  responses: {
    "200": paginatedResponse(reorderItemRowSchema).extend({
      meta: paginationMetaSchema.extend({
        stateCounts: reorderStateCountsSchema,
      }),
    }),
  },
  pagination: {
    sortableFields: [...REORDER_ITEM_SORT_FIELDS],
    searchable: true,
  },
});

reorderRouter.get(
  REORDER_ROUTES.runs,
  requirePermission("inventory.view"),
  asyncHandler(reorderController.runs),
);
register({
  method: "GET",
  path: fullPath(REORDER_ROUTES.runs),
  tags: ["reorder"],
  summary:
    "Run history, newest first (BR-RO-22). Filters `state` (comma list of running, done, failed) and `trigger`.",
  auth: { type: "permission", key: "inventory.view" },
  request: { query: reorderRunsQuerySchema },
  responses: { "200": paginatedResponse(reorderRunSchema) },
  pagination: {
    sortableFields: [...REORDER_RUN_SORT_FIELDS],
    searchable: false,
  },
});

reorderRouter.get(
  REORDER_ROUTES.runDetails,
  requirePermission("inventory.view"),
  asyncHandler(reorderController.runDetails),
);
register({
  method: "GET",
  path: fullPath(REORDER_ROUTES.runDetails),
  tags: ["reorder"],
  summary:
    "One run with its raised / skipped / deferred items, PR and PO link (BR-RO-22). 404 REORDER_RUN_NOT_FOUND.",
  auth: { type: "permission", key: "inventory.view" },
  request: { params: reorderRunIdParamSchema },
  responses: { "200": successResponse(reorderRunDetailSchema) },
});

reorderRouter.post(
  REORDER_ROUTES.checkNow,
  requirePermission("reorder.manage"),
  asyncHandler(reorderController.checkNow),
);
register({
  method: "POST",
  path: fullPath(REORDER_ROUTES.checkNow),
  tags: ["reorder"],
  summary:
    "Start a reorder run now (BR-RO-11..16). 201 returns the finished run: state done (pr null = nothing to order) or failed (failureReason). 409 REORDER_RUN_BUSY.",
  auth: { type: "permission", key: "reorder.manage" },
  request: { body: reorderCheckNowBodySchema },
  responses: { "201": successResponse(reorderRunSchema) },
});

reorderRouter.get(
  REORDER_ROUTES.settings,
  requirePermission("inventory.view"),
  asyncHandler(reorderController.getSettings),
);
register({
  method: "GET",
  path: fullPath(REORDER_ROUTES.settings),
  tags: ["reorder"],
  summary:
    "Reorder settings: switch, run hour (IST), draft owner, draftOwnerValid, last changed by (BR-RO-20).",
  auth: { type: "permission", key: "inventory.view" },
  responses: { "200": successResponse(reorderSettingsSchema) },
});

reorderRouter.patch(
  REORDER_ROUTES.settings,
  requirePermission("reorder.manage"),
  asyncHandler(reorderController.updateSettings),
);
register({
  method: "PATCH",
  path: fullPath(REORDER_ROUTES.settings),
  tags: ["reorder"],
  summary:
    "Change switch / run hour / draft owner, one history row per changed field (BR-RO-20). draftOwnerId null clears. 400 REORDER_OWNER_INVALID.",
  auth: { type: "permission", key: "reorder.manage" },
  request: { body: updateReorderSettingsSchema },
  responses: { "200": successResponse(reorderSettingsSchema) },
});

reorderRouter.get(
  REORDER_ROUTES.ownerCandidates,
  requirePermission("reorder.manage"),
  asyncHandler(reorderController.ownerCandidates),
);
register({
  method: "GET",
  path: fullPath(REORDER_ROUTES.ownerCandidates),
  tags: ["reorder"],
  summary:
    "Active employees holding pr.manage (super-admin included) for the draft owner select (BR-RO-20).",
  auth: { type: "permission", key: "reorder.manage" },
  request: { query: reorderOwnerCandidatesQuerySchema },
  responses: { "200": paginatedResponse(reorderOwnerCandidateSchema) },
  pagination: { sortableFields: ["name"], searchable: true },
});

export { reorderRouter as reorderRoutes };
