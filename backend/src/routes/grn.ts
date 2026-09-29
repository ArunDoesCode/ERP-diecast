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
  grnQaActionBodySchema,
  grnSchema,
  updateGrnSchema,
} from "../types/grn.types";
import { END_POINTS } from "./end-points";

const GRN_ROUTES = END_POINTS.grn;
const GRN_BASE_PATH = "/api/grn";

// Roles per permission key (docs/specs/grn.md "Who can do what") = seed roles + super-admin.
const GRN_DRAFT_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office", "floor_supervisor"],
};
const GRN_QA_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office", "qa_inspector"],
};
const GRN_BYPASS_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office"],
};
const GRN_CORRECTION_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office"],
};
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
  ), // perm: grn.view
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
  ), // perm: grn.view
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
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: grn.edit_draft
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
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: grn.edit_draft
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
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: grn.edit_draft
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
  requireRole("super-admin", "owner", "back_office", "qa_inspector"), // perm: grn.qa_decide
  asyncHandler(grnController.qaAction),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.qaAction}`,
  tags: ["grn"],
  summary:
    "QA decision on a GRN line: acceptedQty + rejectedQty = arrived. Accepted qty > 0 posts to the inventory ledger (referenceType=grn) and rolls the PO item/status forward. Past 105% of ordered qty: 400 unless the actor holds grn.over_receipt_override and sends overrideReason.",
  auth: GRN_QA_AUTH,
  request: { body: grnQaActionBodySchema },
  responses: { "200": successResponse(grnItemSchema) },
});

grnRouter.post(
  GRN_ROUTES.bypass,
  requireRole("super-admin", "owner", "back_office"), // perm: grn.qa_bypass
  asyncHandler(grnController.bypass),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.bypass}`,
  tags: ["grn"],
  summary:
    "Fast-track QA bypass for a GRN line (mandatory reason). Posts to the inventory ledger immediately (referenceType=grn_bypass) and rolls the PO item/status forward.",
  auth: GRN_BYPASS_AUTH,
  request: { body: grnBypassSchema },
  responses: { "200": successResponse(grnItemSchema) },
});

grnRouter.post(
  GRN_ROUTES.correction,
  requireRole("super-admin", "owner", "back_office"), // perm: grn.correct
  asyncHandler(grnController.correction),
);
register({
  method: "POST",
  path: `${GRN_BASE_PATH}${GRN_ROUTES.correction}`,
  tags: ["grn"],
  summary:
    "Correct a previously posted GRN line: posts one grn_correction ledger row (-qty at the posted cost), lowers PO received qty; the line's acceptedQty is never edited.",
  auth: GRN_CORRECTION_AUTH,
  request: { body: grnCorrectionSchema },
  responses: { "201": successResponse(assetInventoryMovementSchema) },
});

export { grnRouter as grnRoutes };
