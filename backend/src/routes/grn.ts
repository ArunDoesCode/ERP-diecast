import { Hono } from "hono";

import { grnController } from "../controller/grnController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import type { AuthRequirement } from "../lib/route-registry";
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
  grnQaActionSchema,
  grnSchema,
  updateGrnSchema,
} from "../types/grn.types";
import { END_POINTS } from "./end-points";

const GRN_ROUTES = END_POINTS.grn;
const GRN_BASE_PATH = "/api/grn";

// Create/update draft, bypass.
const GRN_DRAFT_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office", "floor_supervisor"],
};
// QA accept/reject.
const GRN_QA_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office", "qa_inspector"],
};
// Correction.
const GRN_CORRECTION_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office"],
};
// List/details — every desk role, read-only.
const GRN_READ_AUTH: AuthRequirement = {
  type: "roles",
  roles: [
    "super-admin",
    "owner",
    "back_office",
    "floor_supervisor",
    "qa_inspector",
    "die_designer",
  ],
};

const grnRouter = new Hono<AppEnv>();

grnRouter.use("*", requireAuth);

grnRouter.get(
  GRN_ROUTES.list,
  requireRole(
    "super-admin",
    "owner",
    "back_office",
    "floor_supervisor",
    "qa_inspector",
    "die_designer",
  ),
  asyncHandler(grnController.list),
);
register({
  method: "GET",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.list}`,
  tags: ["grn"],
  summary: "List GRNs, paginated. Filterable by poId/status/qaStatus.",
  auth: GRN_READ_AUTH,
  request: { query: grnListQuerySchema },
  responses: { "200": paginatedResponse(grnSchema) },
  pagination: {
    sortableFields: ["id", "grnNumber", "status", "receivedDate"],
    searchable: true,
  },
});

grnRouter.get(
  GRN_ROUTES.details,
  requireRole(
    "super-admin",
    "owner",
    "back_office",
    "floor_supervisor",
    "qa_inspector",
    "die_designer",
  ),
  asyncHandler(grnController.details),
);
register({
  method: "GET",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.details}`,
  tags: ["grn"],
  summary:
    "Get a GRN with its line items, joined back to item master + PO-item ordered qty.",
  auth: GRN_READ_AUTH,
  responses: { "200": successResponse(grnDetailsSchema) },
});

grnRouter.post(
  GRN_ROUTES.create,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"),
  asyncHandler(grnController.create),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.create}`,
  tags: ["grn"],
  summary:
    "Record a goods receipt against a dispatched/partial_received PO. Created as draft — no stock effect until a line is QA-accepted or bypassed.",
  auth: GRN_DRAFT_AUTH,
  request: { body: createGrnSchema },
  responses: { "201": successResponse(grnDetailsSchema) },
});

grnRouter.patch(
  GRN_ROUTES.update,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"),
  asyncHandler(grnController.update),
);
register({
  method: "PATCH",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.update}`,
  tags: ["grn"],
  summary:
    "Update a draft GRN's header fields and/or line arrivedQty. Only legal while draft.",
  auth: GRN_DRAFT_AUTH,
  request: { body: updateGrnSchema },
  responses: { "200": successResponse(grnDetailsSchema) },
});

grnRouter.delete(
  GRN_ROUTES.remove,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"),
  asyncHandler(grnController.remove),
);
register({
  method: "DELETE",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.remove}`,
  tags: ["grn"],
  summary: "Delete a draft GRN. Only legal while draft.",
  auth: GRN_DRAFT_AUTH,
  responses: { "200": successResponse(grnSchema.pick({ id: true })) },
});

grnRouter.post(
  GRN_ROUTES.qaAction,
  requireRole("super-admin", "owner", "back_office", "qa_inspector"),
  asyncHandler(grnController.qaAction),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.qaAction}`,
  tags: ["grn"],
  summary:
    "QA accept/reject a GRN line. Accept posts to the inventory ledger (referenceType=grn) and rolls the PO item/status forward. Blocked past 105% of ordered qty unless the actor is owner/back_office.",
  auth: GRN_QA_AUTH,
  request: { body: grnQaActionSchema },
  responses: { "200": successResponse(grnItemSchema) },
});

grnRouter.post(
  GRN_ROUTES.bypass,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"),
  asyncHandler(grnController.bypass),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.bypass}`,
  tags: ["grn"],
  summary:
    "Fast-track QA bypass for a GRN line (mandatory reason). Posts to the inventory ledger immediately (referenceType=grn_bypass) and rolls the PO item/status forward.",
  auth: GRN_DRAFT_AUTH,
  request: { body: grnBypassSchema },
  responses: { "200": successResponse(grnItemSchema) },
});

grnRouter.post(
  GRN_ROUTES.correction,
  requireRole("super-admin", "owner", "back_office"),
  asyncHandler(grnController.correction),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.correction}`,
  tags: ["grn"],
  summary:
    "Correct a previously posted GRN line — posts a negative stock_adjustment ledger entry without mutating the original GRN line row.",
  auth: GRN_CORRECTION_AUTH,
  request: { body: grnCorrectionSchema },
  responses: { "201": successResponse(assetInventoryMovementSchema) },
});

export { grnRouter as grnRoutes };
