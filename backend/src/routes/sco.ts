import { Hono } from "hono";

import { scoController } from "../controller/scoController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  cancelScoSchema,
  createScoSchema,
  scoDetailsSchema,
  scoListQuerySchema,
  scoResponseSchema,
  updateScoSchema,
} from "../types/sco.types";
import { END_POINTS } from "./end-points";

const SCO_ROUTES = END_POINTS.sco;
const SCO_BASE_PATH = "/api/sco";

const scoRouter = new Hono<AppEnv>();

scoRouter.get(
  SCO_ROUTES.list,
  requirePermission("sco.view"),
  asyncHandler(scoController.list),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.list}`,
  tags: ["sco"],
  summary:
    "List subcontracting orders, paginated. Filters: `status` (comma list), `vendorId`, `q` (SCO number or vendor name).",
  auth: { type: "permission", key: "sco.view" },
  request: { query: scoListQuerySchema },
  responses: { "200": paginatedResponse(scoResponseSchema) },
  pagination: {
    sortableFields: [
      "id",
      "scoNumber",
      "status",
      "createdAt",
      "expectedReturnDate",
    ],
    searchable: true,
  },
});

scoRouter.get(
  SCO_ROUTES.details,
  requirePermission("sco.view"),
  asyncHandler(scoController.details),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.details}`,
  tags: ["sco"],
  summary:
    "Get a subcontracting order with its lines (item names, computed line value and GST, counters).",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(scoDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.create,
  requirePermission("sco.manage"),
  asyncHandler(scoController.create),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.create}`,
  tags: ["sco"],
  summary:
    "Create a draft subcontracting order with its lines in one call (BR-SCO-01..04). Line price/GST default to the vendor's service price list.",
  auth: { type: "permission", key: "sco.manage" },
  request: { body: createScoSchema },
  responses: { "201": successResponse(scoDetailsSchema) },
});

scoRouter.patch(
  SCO_ROUTES.update,
  requirePermission("sco.manage"),
  asyncHandler(scoController.update),
);
register({
  method: "PATCH",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.update}`,
  tags: ["sco"],
  summary:
    "Edit a draft SCO (BR-SCO-05): header fields and/or replace all lines. Non-draft = 409; `status` in body = 400.",
  auth: { type: "permission", key: "sco.manage" },
  request: { body: updateScoSchema },
  responses: { "200": successResponse(scoDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.submit,
  requirePermission("sco.manage"),
  asyncHandler(scoController.submit),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.submit}`,
  tags: ["sco"],
  summary:
    "Submit a draft SCO for approval (BR-SCO-06); only its creator. Result is pending_approval, or approved when no chain applies.",
  auth: { type: "permission", key: "sco.manage" },
  responses: { "200": successResponse(scoDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.cancel,
  requirePermission("sco.manage"),
  asyncHandler(scoController.cancel),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.cancel}`,
  tags: ["sco"],
  summary:
    "Cancel an SCO (BR-SCO-20): draft/pending_approval/approved with nothing issued, else 409. Reason 3-500 chars always; the open approval request is cancelled too.",
  auth: { type: "permission", key: "sco.manage" },
  request: { body: cancelScoSchema },
  responses: { "200": successResponse(scoDetailsSchema) },
});

export { scoRouter as scoRoutes };
