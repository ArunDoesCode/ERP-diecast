import { Hono } from "hono";

import { grnController } from "../controller/grnController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { assetInventoryMovementSchema } from "../types/asset.types";
import {
  createGrnSchema,
  grnBypassSchema,
  grnCorrectionSchema,
  grnDetailsSchema,
  grnItemSchema,
  grnListQuerySchema,
  grnQaActionBodySchema,
  grnSchema,
  updateGrnSchema,
} from "../types/grn.types";
import { END_POINTS } from "./end-points";

const GRN_ROUTES = END_POINTS.grn;
const GRN_BASE_PATH = "/api/grn";

const grnRouter = new Hono<AppEnv>();

grnRouter.get(
  GRN_ROUTES.list,
  requirePermission("grn.view"),
  asyncHandler(grnController.list),
);
register({
  method: "GET",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.list}`,
  tags: ["grn"],
  summary: "List GRNs, paginated. Filterable by poId/status/qaStatus.",
  auth: { type: "permission", key: "grn.view" },
  request: { query: grnListQuerySchema },
  responses: { "200": paginatedResponse(grnSchema) },
  pagination: {
    sortableFields: ["id", "grnNumber", "status", "receivedDate"],
    searchable: true,
  },
});

grnRouter.get(
  GRN_ROUTES.details,
  requirePermission("grn.view"),
  asyncHandler(grnController.details),
);
register({
  method: "GET",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.details}`,
  tags: ["grn"],
  summary:
    "Get a GRN with its line items, joined back to item master + PO-item ordered qty.",
  auth: { type: "permission", key: "grn.view" },
  responses: { "200": successResponse(grnDetailsSchema) },
});

grnRouter.post(
  GRN_ROUTES.create,
  requirePermission("grn.edit_draft"),
  asyncHandler(grnController.create),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.create}`,
  tags: ["grn"],
  summary:
    "Record a goods receipt against a dispatched/partial_received PO. Created as draft — no stock effect until a line is QA-accepted or bypassed.",
  auth: { type: "permission", key: "grn.edit_draft" },
  request: { body: createGrnSchema },
  responses: { "201": successResponse(grnDetailsSchema) },
});

grnRouter.patch(
  GRN_ROUTES.update,
  requirePermission("grn.edit_draft"),
  asyncHandler(grnController.update),
);
register({
  method: "PATCH",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.update}`,
  tags: ["grn"],
  summary:
    "Update a draft GRN's header fields and/or line arrivedQty. Only legal while draft.",
  auth: { type: "permission", key: "grn.edit_draft" },
  request: { body: updateGrnSchema },
  responses: { "200": successResponse(grnDetailsSchema) },
});

grnRouter.delete(
  GRN_ROUTES.remove,
  requirePermission("grn.edit_draft"),
  asyncHandler(grnController.remove),
);
register({
  method: "DELETE",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.remove}`,
  tags: ["grn"],
  summary: "Delete a draft GRN. Only legal while draft.",
  auth: { type: "permission", key: "grn.edit_draft" },
  responses: { "200": successResponse(grnSchema.pick({ id: true })) },
});

grnRouter.post(
  GRN_ROUTES.qaAction,
  requirePermission("grn.qa_decide"),
  asyncHandler(grnController.qaAction),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.qaAction}`,
  tags: ["grn"],
  summary:
    "QA decision on a GRN line: acceptedQty + rejectedQty = arrived. Accepted qty > 0 posts to the inventory ledger (referenceType=grn) and rolls the PO item/status forward. Past 105% of ordered qty: 400 unless the actor holds grn.over_receipt_override and sends overrideReason.",
  auth: { type: "permission", key: "grn.qa_decide" },
  request: { body: grnQaActionBodySchema },
  responses: { "200": successResponse(grnItemSchema) },
});

grnRouter.post(
  GRN_ROUTES.bypass,
  requirePermission("grn.qa_bypass"),
  asyncHandler(grnController.bypass),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.bypass}`,
  tags: ["grn"],
  summary:
    "Fast-track QA bypass for a GRN line (mandatory reason). Posts to the inventory ledger immediately (referenceType=grn_bypass) and rolls the PO item/status forward.",
  auth: { type: "permission", key: "grn.qa_bypass" },
  request: { body: grnBypassSchema },
  responses: { "200": successResponse(grnItemSchema) },
});

grnRouter.post(
  GRN_ROUTES.correction,
  requirePermission("grn.correct"),
  asyncHandler(grnController.correction),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.correction}`,
  tags: ["grn"],
  summary:
    "Correct a previously posted GRN line: posts one grn_correction ledger row (-qty at the posted cost), lowers PO received qty; the line's acceptedQty is never edited.",
  auth: { type: "permission", key: "grn.correct" },
  request: { body: grnCorrectionSchema },
  responses: { "201": successResponse(assetInventoryMovementSchema) },
});

export { grnRouter as grnRoutes };
