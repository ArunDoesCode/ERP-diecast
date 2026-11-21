import { Hono } from "hono";

import { purchaseReturnController } from "../controller/purchaseReturnController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  awaitingReturnListResponseSchema,
  awaitingReturnQuerySchema,
  cancelPurchaseReturnSchema,
  createPurchaseReturnSchema,
  purchaseReturnCancelledDraftSchema,
  purchaseReturnCancelledSchema,
  purchaseReturnCreatedSchema,
  purchaseReturnDetailsSchema,
  purchaseReturnListQuerySchema,
  purchaseReturnListResponseSchema,
  purchaseReturnPostedSchema,
  purchaseReturnPrefillSchema,
  updatePurchaseReturnSchema,
} from "../types/purchaseReturn.types";
import { END_POINTS } from "./end-points";

const PRT_ROUTES = END_POINTS.purchaseReturn;
const PRT_BASE_PATH = "/api/purchase-return";

const purchaseReturnRouter = new Hono<AppEnv>();

purchaseReturnRouter.get(
  PRT_ROUTES.list,
  requirePermission("purchase_return.view"),
  asyncHandler(purchaseReturnController.list),
);
register({
  method: "GET",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.list}`,
  tags: ["purchase-return"],
  summary:
    "List purchase returns, paginated. Filter by status/supplierId/grnId/poId/dateFrom/dateTo/q. meta adds statusCounts and awaitingCount.",
  auth: { type: "permission", key: "purchase_return.view" },
  request: { query: purchaseReturnListQuerySchema },
  responses: { "200": purchaseReturnListResponseSchema },
  pagination: {
    sortableFields: ["id", "proNumber", "createdAt", "status"],
    searchable: true,
  },
});

purchaseReturnRouter.get(
  PRT_ROUTES.awaiting,
  requirePermission("purchase_return.view"),
  asyncHandler(purchaseReturnController.awaiting),
);
register({
  method: "GET",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.awaiting}`,
  tags: ["purchase-return"],
  summary:
    "Awaiting-return GRN lines (rejected qty not yet reserved by a non-cancelled return), paginated. Filter by supplierId. meta adds statusCounts and awaitingCount.",
  auth: { type: "permission", key: "purchase_return.view" },
  request: { query: awaitingReturnQuerySchema },
  responses: { "200": awaitingReturnListResponseSchema },
  pagination: {
    sortableFields: ["grnId", "grnNumber", "receivedDate"],
    searchable: false,
  },
});

purchaseReturnRouter.get(
  PRT_ROUTES.details,
  requirePermission("purchase_return.view"),
  asyncHandler(purchaseReturnController.details),
);
register({
  method: "GET",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.details}`,
  tags: ["purchase-return"],
  summary:
    "Purchase return details: header, lines, document flow, debit note, events, draft post preview. Also feeds the debit note and return challan prints.",
  auth: { type: "permission", key: "purchase_return.view" },
  responses: { "200": successResponse(purchaseReturnDetailsSchema) },
});

purchaseReturnRouter.get(
  PRT_ROUTES.prefill,
  requirePermission("purchase_return.edit_draft"),
  asyncHandler(purchaseReturnController.prefill),
);
register({
  method: "GET",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.prefill}`,
  tags: ["purchase-return"],
  summary: "Suggested draft for Return to supplier from a GRN. Writes nothing.",
  auth: { type: "permission", key: "purchase_return.edit_draft" },
  responses: { "200": successResponse(purchaseReturnPrefillSchema) },
});

purchaseReturnRouter.post(
  PRT_ROUTES.create,
  requirePermission("purchase_return.edit_draft"),
  asyncHandler(purchaseReturnController.create),
);
register({
  method: "POST",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.create}`,
  tags: ["purchase-return"],
  summary:
    "Create a draft purchase return from one posted GRN. Rate, GST %, item, unit and heat no. are server-set (extra body key is 400).",
  auth: { type: "permission", key: "purchase_return.edit_draft" },
  request: { body: createPurchaseReturnSchema },
  responses: { "201": successResponse(purchaseReturnCreatedSchema) },
});

purchaseReturnRouter.patch(
  PRT_ROUTES.update,
  requirePermission("purchase_return.edit_draft"),
  asyncHandler(purchaseReturnController.update),
);
register({
  method: "PATCH",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.update}`,
  tags: ["purchase-return"],
  summary:
    "Edit a draft return (id in body). lines, if sent, replace all lines.",
  auth: { type: "permission", key: "purchase_return.edit_draft" },
  request: { body: updatePurchaseReturnSchema },
  responses: { "200": successResponse(purchaseReturnCreatedSchema) },
});

purchaseReturnRouter.post(
  PRT_ROUTES.cancelDraft,
  requirePermission("purchase_return.edit_draft"),
  asyncHandler(purchaseReturnController.cancelDraft),
);
register({
  method: "POST",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.cancelDraft}`,
  tags: ["purchase-return"],
  summary: "Cancel a draft return. Empty body allowed.",
  auth: { type: "permission", key: "purchase_return.edit_draft" },
  responses: { "200": successResponse(purchaseReturnCancelledDraftSchema) },
});

purchaseReturnRouter.post(
  PRT_ROUTES.post,
  requirePermission("purchase_return.post"),
  asyncHandler(purchaseReturnController.post),
);
register({
  method: "POST",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.post}`,
  tags: ["purchase-return"],
  summary:
    "Post a draft return: accepted lines leave stock (ledger pro), debit note and challan numbers are made, counters move. Empty body allowed.",
  auth: { type: "permission", key: "purchase_return.post" },
  responses: { "200": successResponse(purchaseReturnPostedSchema) },
});

purchaseReturnRouter.post(
  PRT_ROUTES.cancel,
  requirePermission("purchase_return.cancel_posted"),
  asyncHandler(purchaseReturnController.cancel),
);
register({
  method: "POST",
  path: `${PRT_BASE_PATH}${PRT_ROUTES.cancel}`,
  tags: ["purchase-return"],
  summary:
    "Cancel a posted return with a reason: stock comes back (ledger pro_cancel), debit note cancelled, counters reversed.",
  auth: { type: "permission", key: "purchase_return.cancel_posted" },
  request: { body: cancelPurchaseReturnSchema },
  responses: { "200": successResponse(purchaseReturnCancelledSchema) },
});

export { purchaseReturnRouter as purchaseReturnRoutes };
