import { Hono } from "hono";

import { prController } from "../controller/prController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  cancelPrSchema,
  createPrSchema,
  prCancelResultSchema,
  prDetailsSchema,
  prLineCancelResultSchema,
  prListQuerySchema,
  prSchema,
  prUpdateResultSchema,
  updatePrSchema,
} from "../types/pr.types";
import { END_POINTS } from "./end-points";

const PR_ROUTES = END_POINTS.pr;
const PR_BASE_PATH = "/api/pr";

const prRouter = new Hono<AppEnv>();

prRouter.get(
  PR_ROUTES.list,
  requirePermission("pr.manage"),
  asyncHandler(prController.list),
);
register({
  method: "GET",
  path: `${PR_BASE_PATH}${PR_ROUTES.list}`,
  tags: ["pr"],
  summary:
    "List purchase requisitions (PRs feed into purchase order creation), paginated.",
  auth: { type: "permission", key: "pr.manage" },
  request: { query: prListQuerySchema },
  responses: { "200": paginatedResponse(prSchema) },
  pagination: {
    sortableFields: ["id", "prNumber", "type", "status", "createdAt"],
    searchable: true,
  },
});

prRouter.get(
  PR_ROUTES.details,
  requirePermission("pr.manage"),
  asyncHandler(prController.details),
);
register({
  method: "GET",
  path: `${PR_BASE_PATH}${PR_ROUTES.details}`,
  tags: ["pr"],
  summary: "Get a purchase requisition with its line items.",
  auth: { type: "permission", key: "pr.manage" },
  responses: { "200": successResponse(prDetailsSchema) },
});

prRouter.post(
  PR_ROUTES.create,
  requirePermission("pr.manage"),
  asyncHandler(prController.create),
);
register({
  method: "POST",
  path: `${PR_BASE_PATH}${PR_ROUTES.create}`,
  tags: ["pr"],
  summary: "Create a purchase requisition with its line items.",
  auth: { type: "permission", key: "pr.manage" },
  request: { body: createPrSchema },
  responses: { "201": successResponse(prUpdateResultSchema) },
});

prRouter.patch(
  PR_ROUTES.update,
  requirePermission("pr.manage"),
  asyncHandler(prController.update),
);
register({
  method: "PATCH",
  path: `${PR_BASE_PATH}${PR_ROUTES.update}`,
  tags: ["pr"],
  summary:
    "Update a purchase requisition's fields and/or insert/update/delete line items.",
  auth: { type: "permission", key: "pr.manage" },
  request: { body: updatePrSchema },
  responses: { "200": successResponse(prUpdateResultSchema) },
});

prRouter.delete(
  PR_ROUTES.remove,
  requirePermission("pr.manage"),
  asyncHandler(prController.remove),
);
register({
  method: "DELETE",
  path: `${PR_BASE_PATH}${PR_ROUTES.remove}`,
  tags: ["pr"],
  summary:
    "Cancel a purchase requisition (soft cancel; reason 3-500 chars required).",
  auth: { type: "permission", key: "pr.manage" },
  request: { body: cancelPrSchema },
  responses: { "200": successResponse(prCancelResultSchema) },
});

prRouter.post(
  PR_ROUTES.cancelLine,
  requirePermission("pr.manage"),
  asyncHandler(prController.cancelLine),
);
register({
  method: "POST",
  path: `${PR_BASE_PATH}${PR_ROUTES.cancelLine}`,
  tags: ["pr"],
  summary:
    "Cancel one pending PR line (BR-PR-33): header must be approved/partial_ordered, requester or super-admin only. " +
    "A line on a PO is 409 PR_LINE_ON_LIVE_PO; the header is recomputed (BR-PR-36, all lines cancelled -> PR cancelled). " +
    "Reason 3-500 chars is required.",
  auth: { type: "permission", key: "pr.manage" },
  request: { body: cancelPrSchema },
  responses: { "200": successResponse(prLineCancelResultSchema) },
});

export { prRouter as prRoutes };
