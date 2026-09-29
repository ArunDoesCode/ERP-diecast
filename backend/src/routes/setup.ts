import { Hono } from "hono";
import { z } from "zod";

import { employeeController } from "../controller/employeeController";
import { moduleController } from "../controller/moduleController";
import { pageController } from "../controller/pageController";
import { permissionController } from "../controller/permissionController";
import { roleController } from "../controller/roleController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import {
  deleteResponse,
  paginatedResponse,
  successResponse,
} from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  employeeInputSchema,
  employeeListQuerySchema,
  employeeQrTokenSchema,
  employeeSchema,
  employeeSearchQuerySchema,
  employeeUpdateSchema,
  moduleSchema,
  pageInputSchema,
  pageListQuerySchema,
  pageSchema,
  pageUpdateSchema,
  roleInputSchema,
  roleListQuerySchema,
  rolePageSchema,
  rolePermissionDiffSchema,
  roleSchema,
  roleUpdateSchema,
} from "../types/setup.types";
import { END_POINTS } from "./end-points";

const SETUP_ROUTES = END_POINTS.setup;
const SETUP_BASE_PATH = "/api/setup";

const setupRouter = new Hono<AppEnv>();

setupRouter.get(
  SETUP_ROUTES.modules.list,
  requirePermission("setup.roles.manage"),
  asyncHandler(moduleController.list),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.modules.list}`,
  tags: ["setup", "modules"],
  summary: "List all modules.",
  auth: { type: "permission", key: "setup.roles.manage" },
  responses: { "200": successResponse(z.array(moduleSchema)) },
  notes: [
    "Bounded reference data (all modules) — pagination intentionally omitted",
  ],
});

setupRouter.get(
  SETUP_ROUTES.employees.list,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.list),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.list}`,
  tags: ["setup", "employees"],
  summary: "List employees, paginated.",
  auth: { type: "permission", key: "setup.employees.manage" },
  request: { query: employeeListQuerySchema },
  responses: { "200": paginatedResponse(employeeSchema) },
  pagination: {
    sortableFields: ["name", "roleId", "dailyRatePaise", "isActive"],
    searchable: false,
  },
});

setupRouter.get(
  SETUP_ROUTES.employees.search,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.search),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.search}`,
  tags: ["setup", "employees"],
  summary: "Debounced name-search over employees, paginated.",
  auth: { type: "permission", key: "setup.employees.manage" },
  request: { query: employeeSearchQuerySchema },
  responses: { "200": paginatedResponse(employeeSchema) },
  pagination: {
    sortableFields: ["name", "roleId", "dailyRatePaise", "isActive"],
    searchable: true,
  },
});

setupRouter.post(
  SETUP_ROUTES.employees.create,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.create),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.create}`,
  tags: ["setup", "employees"],
  summary:
    "Create an employee (desk-worker password login or operator QR login).",
  auth: { type: "permission", key: "setup.employees.manage" },
  request: { body: employeeInputSchema },
  responses: { "201": successResponse(employeeSchema) },
});

setupRouter.patch(
  SETUP_ROUTES.employees.update,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.update),
);
register({
  method: "PATCH",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.update}`,
  tags: ["setup", "employees"],
  summary: "Update an employee.",
  auth: { type: "permission", key: "setup.employees.manage" },
  request: { body: employeeUpdateSchema },
  responses: { "200": successResponse(employeeSchema) },
});

setupRouter.delete(
  SETUP_ROUTES.employees.remove,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.remove),
);
register({
  method: "DELETE",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.remove}`,
  tags: ["setup", "employees"],
  summary: "Soft-delete (deactivate) an employee.",
  auth: { type: "permission", key: "setup.employees.manage" },
  responses: { "200": deleteResponse() },
});

setupRouter.post(
  SETUP_ROUTES.employees.generateQr,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.generateQr),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.generateQr}`,
  tags: ["setup", "employees"],
  summary: "Regenerate an operator's QR login token (returned once, raw).",
  auth: { type: "permission", key: "setup.employees.manage" },
  responses: { "200": successResponse(employeeQrTokenSchema) },
});

setupRouter.get(
  SETUP_ROUTES.roles.list,
  requirePermission("setup.roles.manage"),
  asyncHandler(roleController.list),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.list}`,
  tags: ["setup", "roles"],
  summary: "List roles, paginated.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { query: roleListQuerySchema },
  responses: { "200": paginatedResponse(roleSchema) },
  pagination: { sortableFields: ["name"], searchable: false },
});

setupRouter.post(
  SETUP_ROUTES.roles.create,
  requirePermission("setup.roles.manage"),
  asyncHandler(roleController.create),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.create}`,
  tags: ["setup", "roles"],
  summary: "Create a role.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: roleInputSchema },
  responses: { "201": successResponse(roleSchema) },
});

setupRouter.patch(
  SETUP_ROUTES.roles.update,
  requirePermission("setup.roles.manage"),
  asyncHandler(roleController.update),
);
register({
  method: "PATCH",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.update}`,
  tags: ["setup", "roles"],
  summary: "Update a role.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: roleUpdateSchema },
  responses: { "200": successResponse(roleSchema) },
});

setupRouter.delete(
  SETUP_ROUTES.roles.remove,
  requirePermission("setup.roles.manage"),
  asyncHandler(roleController.remove),
);
register({
  method: "DELETE",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.remove}`,
  tags: ["setup", "roles"],
  summary: "Delete a role.",
  auth: { type: "permission", key: "setup.roles.manage" },
  responses: { "200": deleteResponse() },
});

setupRouter.get(
  SETUP_ROUTES.pages.list,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.list),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.pages.list}`,
  tags: ["setup", "pages"],
  summary: "List pages, paginated.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { query: pageListQuerySchema },
  responses: { "200": paginatedResponse(pageSchema) },
  pagination: {
    sortableFields: ["label", "path", "moduleId", "sortOrder"],
    searchable: false,
  },
});

setupRouter.post(
  SETUP_ROUTES.pages.create,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.create),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.pages.create}`,
  tags: ["setup", "pages"],
  summary: "Create a page.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: pageInputSchema },
  responses: { "201": successResponse(pageSchema) },
});

setupRouter.patch(
  SETUP_ROUTES.pages.update,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.update),
);
register({
  method: "PATCH",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.pages.update}`,
  tags: ["setup", "pages"],
  summary: "Update a page (key is immutable).",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: pageUpdateSchema },
  responses: { "200": successResponse(pageSchema) },
});

setupRouter.delete(
  SETUP_ROUTES.pages.remove,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.remove),
);
register({
  method: "DELETE",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.pages.remove}`,
  tags: ["setup", "pages"],
  summary: "Delete a page.",
  auth: { type: "permission", key: "setup.roles.manage" },
  responses: { "200": deleteResponse() },
});

setupRouter.get(
  SETUP_ROUTES.permissions.list,
  requirePermission("setup.roles.manage"),
  asyncHandler(permissionController.list),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.permissions.list}`,
  tags: ["setup", "permissions"],
  summary: "List all role-page permission assignments.",
  auth: { type: "permission", key: "setup.roles.manage" },
  responses: { "200": successResponse(z.array(rolePageSchema)) },
  notes: [
    "Bounded reference data (all role-page pairs) — pagination intentionally omitted",
  ],
});

setupRouter.post(
  SETUP_ROUTES.permissions.updateForRole,
  requirePermission("setup.roles.manage"),
  asyncHandler(permissionController.updateForRole),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.permissions.updateForRole}`,
  tags: ["setup", "permissions"],
  summary: "Apply an added/deleted page-permission diff for a role.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: rolePermissionDiffSchema },
  responses: { "200": successResponse(z.array(rolePageSchema)) },
});

export { setupRouter as setupRoutes };
