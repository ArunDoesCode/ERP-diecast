import { Hono } from "hono";

import { bomController } from "../controller/bomController";
import { asyncHandler } from "../lib/async-handler";
import {
  requireAnyPermission,
  requirePermission,
} from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  bomChangeSummarySchema,
  bomDeleteResultSchema,
  bomDetailSchema,
  bomHistoryQuerySchema,
  bomHistoryRowSchema,
  bomIdParamSchema,
  bomItemIdParamSchema,
  bomListQuerySchema,
  bomListRowSchema,
  bomNeedsQuerySchema,
  bomNeedsResponseSchema,
  bomPartIdParamSchema,
  bomReleaseResultSchema,
  bomTreeNodeSchema,
  bomWhereUsedPartSchema,
  bomWhereUsedQuerySchema,
  bomWhereUsedRowSchema,
  bomWriteResultSchema,
  createBomSchema,
  releaseBomSchema,
  retireBomSchema,
  updateBomSchema,
} from "../types/bom.types";
import { END_POINTS } from "./end-points";

const BOM_ROUTES = END_POINTS.bom;
const BOM_BASE_PATH = "/api/bom";

// "/" is the router root: Hono serves it at "/api/bom" (no trailing slash).
const fullPath = (path: string) =>
  path === "/" ? BOM_BASE_PATH : `${BOM_BASE_PATH}${path}`;

const bomRouter = new Hono<AppEnv>();

// Static paths (/needs, /items/..., /parts/...) are registered before /:id.

bomRouter.get(
  BOM_ROUTES.list,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.list),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.list),
  tags: ["bom"],
  summary:
    "List BOM revisions, paginated (BR-BOM-25). Filters: `status` (comma list; default active,draft, or all three when `partId` is given), `kind`, `q` (part SKU / name), `partId` (all revisions of one part).",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { query: bomListQuerySchema },
  responses: { "200": paginatedResponse(bomListRowSchema) },
  pagination: {
    sortableFields: [
      "partSku",
      "partName",
      "revisionNo",
      "kind",
      "status",
      "releasedAt",
      "createdAt",
    ],
    searchable: true,
  },
});

bomRouter.get(
  BOM_ROUTES.needs,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.needs),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.needs),
  tags: ["bom"],
  summary:
    "Needs preview for a part and quantity, full tree or one level (BR-BOM-18). Reads no stock, writes nothing, no prices. 409 NO_ACTIVE_BOM when the part has no active revision.",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { query: bomNeedsQuerySchema },
  responses: { "200": successResponse(bomNeedsResponseSchema) },
});

bomRouter.get(
  BOM_ROUTES.whereUsed,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.whereUsed),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.whereUsed),
  tags: ["bom"],
  summary:
    "Parts whose ACTIVE revision uses the item, as a line, the sent item or the alloy (BR-BOM-19, 16). Paginated.",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { params: bomItemIdParamSchema, query: bomWhereUsedQuerySchema },
  responses: {
    "200": paginatedResponse(bomWhereUsedRowSchema).extend({
      part: bomWhereUsedPartSchema,
    }),
  },
  pagination: {
    sortableFields: ["partSku", "revisionNo"],
    searchable: false,
  },
});

bomRouter.get(
  BOM_ROUTES.partHistory,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.partHistory),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.partHistory),
  tags: ["bom"],
  summary: "Audit rows of a part's BOMs, newest first (BR-BOM-23). Paginated.",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { params: bomPartIdParamSchema, query: bomHistoryQuerySchema },
  responses: { "200": paginatedResponse(bomHistoryRowSchema) },
  pagination: {
    sortableFields: ["changedAt"],
    searchable: false,
  },
});

bomRouter.post(
  BOM_ROUTES.startRevision,
  requirePermission("bom.manage"),
  asyncHandler(bomController.startRevision),
);
register({
  method: "POST",
  path: fullPath(BOM_ROUTES.startRevision),
  tags: ["bom"],
  summary:
    "Start a new draft revision of a part: copy of the active revision, else the latest retired (BR-BOM-14). 409 BOM_DRAFT_OPEN when a draft exists.",
  auth: { type: "permission", key: "bom.manage" },
  request: { params: bomPartIdParamSchema },
  responses: { "201": successResponse(bomWriteResultSchema) },
});

bomRouter.get(
  BOM_ROUTES.details,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.details),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.details),
  tags: ["bom"],
  summary:
    "One BOM revision: header, lines, computed casting figures, audit, `nextStep` (BR-BOM-05, 21, 23, 24).",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { params: bomIdParamSchema },
  responses: { "200": successResponse(bomDetailSchema) },
});

bomRouter.get(
  BOM_ROUTES.tree,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.tree),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.tree),
  tags: ["bom"],
  summary:
    "Level tree under this revision: quantity per piece, `no_bom` / inactive tags; 400 BOM_TOO_LARGE above 1,000 nodes (BR-BOM-09, 10, 21).",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { params: bomIdParamSchema },
  responses: { "200": successResponse(bomTreeNodeSchema) },
});

bomRouter.get(
  BOM_ROUTES.changeSummary,
  requireAnyPermission("bom.view", "bom.manage", "bom.release"),
  asyncHandler(bomController.changeSummary),
);
register({
  method: "GET",
  path: fullPath(BOM_ROUTES.changeSummary),
  tags: ["bom"],
  summary:
    "Dry run of release: added / removed / changed lines and header old -> new vs the part's active revision, plus `problems[]` (BR-BOM-12, 13).",
  auth: {
    type: "permission",
    key: "bom.view",
    alsoKeys: ["bom.manage", "bom.release"],
  },
  request: { params: bomIdParamSchema },
  responses: { "200": successResponse(bomChangeSummarySchema) },
});

bomRouter.post(
  BOM_ROUTES.create,
  requirePermission("bom.manage"),
  asyncHandler(bomController.create),
);
register({
  method: "POST",
  path: fullPath(BOM_ROUTES.create),
  tags: ["bom"],
  summary:
    "Create the first BOM of a part: draft revision A (BR-BOM-01..08, 10). 409 BOM_ALREADY_EXISTS when the part has a revision.",
  auth: { type: "permission", key: "bom.manage" },
  request: { body: createBomSchema },
  responses: { "201": successResponse(bomWriteResultSchema) },
});

bomRouter.patch(
  BOM_ROUTES.update,
  requirePermission("bom.manage"),
  asyncHandler(bomController.update),
);
register({
  method: "PATCH",
  path: fullPath(BOM_ROUTES.update),
  tags: ["bom"],
  summary:
    "Replace a draft's header and lines; needs the `version` from the last read (BR-BOM-03..11). 409 BOM_NOT_DRAFT / BOM_CHANGED_SINCE_REVIEW.",
  auth: { type: "permission", key: "bom.manage" },
  request: { params: bomIdParamSchema, body: updateBomSchema },
  responses: { "200": successResponse(bomWriteResultSchema) },
});

bomRouter.delete(
  BOM_ROUTES.remove,
  requirePermission("bom.manage"),
  asyncHandler(bomController.remove),
);
register({
  method: "DELETE",
  path: fullPath(BOM_ROUTES.remove),
  tags: ["bom"],
  summary: "Delete a draft BOM (BR-BOM-15). 409 BOM_NOT_DRAFT.",
  auth: { type: "permission", key: "bom.manage" },
  request: { params: bomIdParamSchema },
  responses: { "200": successResponse(bomDeleteResultSchema) },
});

bomRouter.post(
  BOM_ROUTES.release,
  requirePermission("bom.release"),
  asyncHandler(bomController.release),
);
register({
  method: "POST",
  path: fullPath(BOM_ROUTES.release),
  tags: ["bom"],
  summary:
    "Release a draft: draft -> active, the previous active -> retired (BR-BOM-12, 13, 17). 400 BOM_RELEASE_INVALID lists every problem; 409 BOM_NOT_DRAFT / BOM_RELEASE_CONFLICT / BOM_CHANGED_SINCE_REVIEW.",
  auth: { type: "permission", key: "bom.release" },
  request: { params: bomIdParamSchema, body: releaseBomSchema },
  responses: { "200": successResponse(bomReleaseResultSchema) },
});

bomRouter.post(
  BOM_ROUTES.retire,
  requirePermission("bom.release"),
  asyncHandler(bomController.retire),
);
register({
  method: "POST",
  path: fullPath(BOM_ROUTES.retire),
  tags: ["bom"],
  summary:
    "Retire an active BOM with no replacement; reason 3-500 chars (BR-BOM-16). 409 BOM_NOT_ACTIVE.",
  auth: { type: "permission", key: "bom.release" },
  request: { params: bomIdParamSchema, body: retireBomSchema },
  responses: { "200": successResponse(bomWriteResultSchema) },
});

export { bomRouter as bomRoutes };
