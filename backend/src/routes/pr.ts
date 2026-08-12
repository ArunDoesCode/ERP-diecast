import { Hono } from "hono";

import { prController } from "../controller/prController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import type { AuthRequirement } from "../lib/route-registry";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  createPrSchema,
  prDetailsSchema,
  prListQuerySchema,
  prSchema,
  prUpdateResultSchema,
  updatePrSchema,
} from "../types/pr.types";
import { END_POINTS } from "./end-points";

const PR_ROUTES = END_POINTS.pr;
const PR_BASE_PATH = "/api/pr";
const PR_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "floor_supervisor", "back_office"],
};

const prRouter = new Hono<AppEnv>();

prRouter.use(
  "*",
  requireAuth,
  requireRole("super-admin", "owner", "floor_supervisor", "back_office"),
);

prRouter.get(PR_ROUTES.list, asyncHandler(prController.list));
register({
  method: "GET",
  path: `${PR_BASE_PATH}${PR_ROUTES.list}`,
  tags: ["pr"],
  summary:
    "List purchase requisitions (PRs feed into purchase order creation), paginated.",
  auth: PR_AUTH,
  request: { query: prListQuerySchema },
  responses: { "200": paginatedResponse(prSchema) },
  pagination: {
    sortableFields: ["id", "prNumber", "type", "status", "createdAt"],
    searchable: true,
  },
});

prRouter.get(PR_ROUTES.details, asyncHandler(prController.details));
register({
  method: "GET",
  path: `${PR_BASE_PATH}${PR_ROUTES.details}`,
  tags: ["pr"],
  summary: "Get a purchase requisition with its line items.",
  auth: PR_AUTH,
  responses: { "200": successResponse(prDetailsSchema) },
});

prRouter.post(PR_ROUTES.create, asyncHandler(prController.create));
register({
  method: "POST",
  path: `${PR_BASE_PATH}${PR_ROUTES.create}`,
  tags: ["pr"],
  summary: "Create a purchase requisition with its line items.",
  auth: PR_AUTH,
  request: { body: createPrSchema },
  responses: { "201": successResponse(prUpdateResultSchema) },
});

prRouter.patch(PR_ROUTES.update, asyncHandler(prController.update));
register({
  method: "PATCH",
  path: `${PR_BASE_PATH}${PR_ROUTES.update}`,
  tags: ["pr"],
  summary:
    "Update a purchase requisition's fields and/or insert/update/delete line items.",
  auth: PR_AUTH,
  request: { body: updatePrSchema },
  responses: { "200": successResponse(prUpdateResultSchema) },
});

prRouter.delete(PR_ROUTES.remove, asyncHandler(prController.remove));
register({
  method: "DELETE",
  path: `${PR_BASE_PATH}${PR_ROUTES.remove}`,
  tags: ["pr"],
  summary: "Cancel a purchase requisition.",
  auth: PR_AUTH,
  responses: { "200": successResponse(prSchema) },
});

export { prRouter as prRoutes };
