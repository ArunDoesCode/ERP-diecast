import { Hono } from "hono";

import { saleOrderController } from "../controller/saleOrderController";
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
  createDraftsResultSchema,
  createDraftsSchema,
  createSaleOrderSchema,
  explosionHeaderSchema,
  explosionListQuerySchema,
  explosionListRowSchema,
  explosionRowSchema,
  explosionRowsQuerySchema,
  runExplosionResultSchema,
  runExplosionSchema,
  saleOrderDetailSchema,
  saleOrderListRowSchema,
  soAuditQuerySchema,
  soAuditRowSchema,
  soExplosionParamSchema,
  soIdParamSchema,
  soListQuerySchema,
  soReasonBodySchema,
  soStatusCountsSchema,
  soVersionBodySchema,
  updateSaleOrderSchema,
} from "../types/saleOrder.types";
import { END_POINTS } from "./end-points";

const SO_ROUTES = END_POINTS.saleOrder;
const SO_BASE_PATH = "/api/sale-orders";

// "/" is the router root: Hono serves it at "/api/sale-orders" (no trailing slash).
const fullPath = (path: string) =>
  path === "/" ? SO_BASE_PATH : `${SO_BASE_PATH}${path}`;

const saleOrderRouter = new Hono<AppEnv>();
const TAGS = ["sale-orders"];

saleOrderRouter.get(
  SO_ROUTES.list,
  requirePermission("so.view"),
  asyncHandler(saleOrderController.list),
);
register({
  method: "GET",
  path: fullPath(SO_ROUTES.list),
  tags: TAGS,
  summary:
    "List sale orders, paginated (BR-SO-04). Filters `q` (SO no., customer PO no., customer name), `status` (CSV, unknown value 400), `customerId`, `orderDateFrom`, `orderDateTo`, `deliveryBefore`. `meta.statusCounts` ignores the `status` filter.",
  auth: { type: "permission", key: "so.view" },
  request: { query: soListQuerySchema },
  responses: {
    "200": paginatedResponse(saleOrderListRowSchema).extend({
      meta: paginationMetaSchema.extend({ statusCounts: soStatusCountsSchema }),
    }),
  },
  pagination: {
    sortableFields: ["soNumber", "orderDate", "createdAt", "totalAmountPaise"],
    searchable: true,
  },
});

saleOrderRouter.get(
  SO_ROUTES.details,
  requirePermission("so.view"),
  asyncHandler(saleOrderController.details),
);
register({
  method: "GET",
  path: fullPath(SO_ROUTES.details),
  tags: TAGS,
  summary:
    "One sale order: header, lines, raisedDocuments (explosion-linked live PR / SCO), current snapshot summary (BR-SO-19, 51).",
  auth: { type: "permission", key: "so.view" },
  request: { params: soIdParamSchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.post(
  SO_ROUTES.create,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.create),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.create),
  tags: TAGS,
  summary:
    "Create a draft SO with lines in one transaction (BR-SO-05..08, 56, 57). 400 inactive customer / item, bad qty / price / dates, same item + date twice; 409 CUSTOMER_PO_EXISTS.",
  auth: { type: "permission", key: "so.manage" },
  request: { body: createSaleOrderSchema },
  responses: { "201": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.patch(
  SO_ROUTES.update,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.update),
);
register({
  method: "PATCH",
  path: fullPath(SO_ROUTES.update),
  tags: TAGS,
  summary:
    "Edit an SO: draft fully, confirmed limited; needs `editVersion` (BR-SO-09, 10, 13, 14, 59, 60). 409 STALE_VERSION / SO_NOT_EDITABLE / SO_FIELD_LOCKED / QTY_BELOW_DELIVERED / SO_LINE_DELIVERED / LIVE_DOCUMENTS_LINKED / CUSTOMER_PO_EXISTS.",
  auth: { type: "permission", key: "so.manage" },
  request: { params: soIdParamSchema, body: updateSaleOrderSchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.post(
  SO_ROUTES.confirm,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.confirm),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.confirm),
  tags: TAGS,
  summary:
    "Confirm a draft SO (BR-SO-12). 400 inactive customer / item or past delivery date; 409 wrong status / STALE_VERSION.",
  auth: { type: "permission", key: "so.manage" },
  request: { params: soIdParamSchema, body: soVersionBodySchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.post(
  SO_ROUTES.hold,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.hold),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.hold),
  tags: TAGS,
  summary:
    "Hold a confirmed SO, reason 3-500 chars (BR-SO-16). 409 wrong status / STALE_VERSION.",
  auth: { type: "permission", key: "so.manage" },
  request: { params: soIdParamSchema, body: soReasonBodySchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.post(
  SO_ROUTES.resume,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.resume),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.resume),
  tags: TAGS,
  summary:
    "Resume an on-hold SO to confirmed (BR-SO-16). 409 wrong status / STALE_VERSION.",
  auth: { type: "permission", key: "so.manage" },
  request: { params: soIdParamSchema, body: soVersionBodySchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.post(
  SO_ROUTES.close,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.close),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.close),
  tags: TAGS,
  summary:
    "Close a confirmed / on-hold SO by hand, reason 3-500 chars; releases reservations (BR-SO-17). 409 wrong status / STALE_VERSION.",
  auth: { type: "permission", key: "so.manage" },
  request: { params: soIdParamSchema, body: soReasonBodySchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.post(
  SO_ROUTES.cancel,
  requirePermission("so.manage"),
  asyncHandler(saleOrderController.cancel),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.cancel),
  tags: TAGS,
  summary:
    "Cancel an SO, reason 3-500 chars (BR-SO-18, 19, 20). 409 HAS_DELIVERIES / LIVE_DOCUMENTS_LINKED / wrong status / STALE_VERSION.",
  auth: { type: "permission", key: "so.manage" },
  request: { params: soIdParamSchema, body: soReasonBodySchema },
  responses: { "200": successResponse(saleOrderDetailSchema) },
});

saleOrderRouter.get(
  SO_ROUTES.audit,
  requirePermission("so.view"),
  asyncHandler(saleOrderController.audit),
);
register({
  method: "GET",
  path: fullPath(SO_ROUTES.audit),
  tags: TAGS,
  summary:
    "Audit trail of the SO: who, when, before -> after; paginated, newest first (BR-SO-52).",
  auth: { type: "permission", key: "so.view" },
  request: { params: soIdParamSchema, query: soAuditQuerySchema },
  responses: { "200": paginatedResponse(soAuditRowSchema) },
  pagination: { sortableFields: ["at"], searchable: false },
});

saleOrderRouter.post(
  SO_ROUTES.runExplosion,
  requirePermission("so.explode"),
  asyncHandler(saleOrderController.runExplosion),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.runExplosion),
  tags: TAGS,
  summary:
    "Run the BOM explosion of a confirmed SO: new numbered snapshot, older one superseded (BR-SO-21..38). 409 SO_NOT_CONFIRMED / EXPLOSION_IN_PROGRESS / EXPLOSION_BUSY; 400 EXPLOSION_TOO_LARGE.",
  auth: { type: "permission", key: "so.explode" },
  request: { params: soIdParamSchema, body: runExplosionSchema },
  responses: { "201": successResponse(runExplosionResultSchema) },
});

saleOrderRouter.get(
  SO_ROUTES.listExplosions,
  requirePermission("so.view"),
  asyncHandler(saleOrderController.listExplosions),
);
register({
  method: "GET",
  path: fullPath(SO_ROUTES.listExplosions),
  tags: TAGS,
  summary: "List the snapshots of an SO, paginated (BR-SO-21).",
  auth: { type: "permission", key: "so.view" },
  request: { params: soIdParamSchema, query: explosionListQuerySchema },
  responses: { "200": paginatedResponse(explosionListRowSchema) },
  pagination: { sortableFields: ["runNo", "createdAt"], searchable: false },
});

saleOrderRouter.get(
  SO_ROUTES.explosionDetails,
  requirePermission("so.view"),
  asyncHandler(saleOrderController.explosionDetails),
);
register({
  method: "GET",
  path: fullPath(SO_ROUTES.explosionDetails),
  tags: TAGS,
  summary:
    "Snapshot header, totals, `outOfDate` and reasons; 404 when the snapshot is not of this SO (BR-SO-38, 51). No prices.",
  auth: { type: "permission", key: "so.view" },
  request: { params: soExplosionParamSchema },
  responses: { "200": successResponse(explosionHeaderSchema) },
});

saleOrderRouter.get(
  SO_ROUTES.explosionRows,
  requirePermission("so.view"),
  asyncHandler(saleOrderController.explosionRows),
);
register({
  method: "GET",
  path: fullPath(SO_ROUTES.explosionRows),
  tags: TAGS,
  summary:
    "Rows of a snapshot, paginated (BR-SO-50, 51). Filters `type`, `net=short`, `flagged`. Job-worker candidates only for `so.explode` holders. No prices.",
  auth: { type: "permission", key: "so.view" },
  request: { params: soExplosionParamSchema, query: explosionRowsQuerySchema },
  responses: { "200": paginatedResponse(explosionRowSchema) },
  pagination: {
    sortableFields: ["level", "sku", "netQty", "type"],
    searchable: false,
  },
});

saleOrderRouter.post(
  SO_ROUTES.createDrafts,
  requirePermission("so.explode"),
  asyncHandler(saleOrderController.createDrafts),
);
register({
  method: "POST",
  path: fullPath(SO_ROUTES.createDrafts),
  tags: TAGS,
  summary:
    "Create draft PRs and SCOs from picked rows of the current snapshot, all or nothing (BR-SO-39..48). Also needs `pr.manage` / `sco.manage` per picked row (service check, 403). 409 SNAPSHOT_SUPERSEDED / SNAPSHOT_OUT_OF_DATE / ROW_ALREADY_RAISED / SO_NOT_CONFIRMED; 400 PICK_OVER_NET.",
  auth: { type: "permission", key: "so.explode" },
  request: { params: soExplosionParamSchema, body: createDraftsSchema },
  responses: { "201": successResponse(createDraftsResultSchema) },
});

export { saleOrderRouter as saleOrderRoutes };
