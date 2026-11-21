import { Hono } from "hono";

import { customerController } from "../controller/customerController";
import { asyncHandler } from "../lib/async-handler";
import {
  requireAnyPermission,
  requirePermission,
} from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  createCustomerSchema,
  customerIdParamSchema,
  customerListQuerySchema,
  customerSchema,
  updateCustomerSchema,
} from "../types/customer.types";
import { END_POINTS } from "./end-points";

const CUSTOMER_ROUTES = END_POINTS.customer;
const CUSTOMER_BASE_PATH = "/api/customers";

// "/" is the router root: Hono serves it at "/api/customers" (no trailing slash).
const fullPath = (path: string) =>
  path === "/" ? CUSTOMER_BASE_PATH : `${CUSTOMER_BASE_PATH}${path}`;

const customerRouter = new Hono<AppEnv>();

customerRouter.get(
  CUSTOMER_ROUTES.list,
  requireAnyPermission("so.view", "customer.manage"),
  asyncHandler(customerController.list),
);
register({
  method: "GET",
  path: fullPath(CUSTOMER_ROUTES.list),
  tags: ["customers"],
  summary:
    "List customers, paginated (BR-SO-03). Filters `q` (name), `isActive`, `stateCode`; also the customer combobox (`?isActive=true&q=`).",
  auth: { type: "permission", key: "so.view", alsoKeys: ["customer.manage"] },
  request: { query: customerListQuerySchema },
  responses: { "200": paginatedResponse(customerSchema) },
  pagination: { sortableFields: ["name", "createdAt"], searchable: true },
});

customerRouter.get(
  CUSTOMER_ROUTES.details,
  requireAnyPermission("so.view", "customer.manage"),
  asyncHandler(customerController.details),
);
register({
  method: "GET",
  path: fullPath(CUSTOMER_ROUTES.details),
  tags: ["customers"],
  summary: "One customer (BR-SO-03). 404 when missing.",
  auth: { type: "permission", key: "so.view", alsoKeys: ["customer.manage"] },
  request: { params: customerIdParamSchema },
  responses: { "200": successResponse(customerSchema) },
});

customerRouter.post(
  CUSTOMER_ROUTES.create,
  requirePermission("customer.manage"),
  asyncHandler(customerController.create),
);
register({
  method: "POST",
  path: fullPath(CUSTOMER_ROUTES.create),
  tags: ["customers"],
  summary:
    "Create a customer (BR-SO-01, 03). 400 bad GSTIN or GSTIN / state mismatch; 409 CUSTOMER_NAME_EXISTS.",
  auth: { type: "permission", key: "customer.manage" },
  request: { body: createCustomerSchema },
  responses: { "201": successResponse(customerSchema) },
});

customerRouter.patch(
  CUSTOMER_ROUTES.update,
  requirePermission("customer.manage"),
  asyncHandler(customerController.update),
);
register({
  method: "PATCH",
  path: fullPath(CUSTOMER_ROUTES.update),
  tags: ["customers"],
  summary:
    "Edit a customer, activate / deactivate with `isActive` (BR-SO-01, 02). At least one field. 409 CUSTOMER_NAME_EXISTS.",
  auth: { type: "permission", key: "customer.manage" },
  request: { params: customerIdParamSchema, body: updateCustomerSchema },
  responses: { "200": successResponse(customerSchema) },
});

export { customerRouter as customerRoutes };
