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
  accessLogListQuerySchema,
  accessLogSchema,
  assignableRoleSchema,
  employeeInputSchema,
  employeeListQuerySchema,
  employeeQrTokenSchema,
  employeeRoleAssignSchema,
  employeeSchema,
  employeeSearchQuerySchema,
  employeeUpdateSchema,
  moduleSchema,
  roleCopyInputSchema,
  roleGrantsDiffSchema,
  roleGrantsSchema,
  roleInputSchema,
  roleListItemSchema,
  roleListQuerySchema,
  roleSchema,
  roleUpdateSchema,
  screenRolesDiffSchema,
  screenSchema,
  screenUpdateSchema,
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
  notes: [
    "409 LAST_ADMIN if it would leave no active super-admin (BR-AUTH-17). Logged.",
  ],
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
  responses: { "200": paginatedResponse(roleListItemSchema) },
  pagination: { sortableFields: ["name"], searchable: false },
  notes: [
    "S6: each row carries keyCount and employeeCount (active employees). Super-admin row: isSuperAdmin=true.",
  ],
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
  summary: "Create a role (no keys, isSystem=false).",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: roleInputSchema },
  responses: { "201": successResponse(roleSchema) },
  notes: ["409 CONFLICT on duplicate name. Logged (BR-AUTH-20)."],
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
  summary: "Rename a role.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: roleUpdateSchema },
  responses: { "200": successResponse(roleSchema) },
  notes: [
    "403 SYSTEM_ROLE_PROTECTED for any system role (BR-AUTH-18); 409 ROLE_IN_APPROVAL_CHAIN (BR-AUTH-19); 409 CONFLICT duplicate name. Logged.",
  ],
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
  notes: [
    "403 SYSTEM_ROLE_PROTECTED; 409 ROLE_HAS_EMPLOYEES (any active employee); 409 ROLE_HAS_INACTIVE_EMPLOYEES (only inactive employees hold it: move them to another role first); 409 ROLE_IN_APPROVAL_CHAIN (BR-AUTH-19). Logged.",
  ],
});

setupRouter.post(
  SETUP_ROUTES.roles.copy,
  requirePermission("setup.roles.manage"),
  asyncHandler(roleController.copy),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.copy}`,
  tags: ["setup", "roles"],
  summary:
    "Create a role as a copy of an existing role (same keys, BR-AUTH-25).",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: roleCopyInputSchema },
  responses: { "201": successResponse(roleSchema) },
  notes: [
    "404 source role missing; 403 SYSTEM_ROLE_PROTECTED if source is super-admin; 409 CONFLICT duplicate name. Copy is never a system role. Logged.",
  ],
});

setupRouter.get(
  SETUP_ROUTES.roles.getGrants,
  requirePermission("setup.roles.manage"),
  asyncHandler(permissionController.getGrants),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.getGrants}`,
  tags: ["setup", "roles", "permissions"],
  summary: "Get a role's grants: the whole key catalog with a granted flag.",
  auth: { type: "permission", key: "setup.roles.manage" },
  responses: { "200": successResponse(roleGrantsSchema) },
  notes: [
    "Bounded reference data (permission catalog) — pagination intentionally omitted",
    "Super-admin role: readOnly=true, every key granted:true (no list to edit, BR-AUTH-18). 404 unknown role.",
  ],
});

setupRouter.post(
  SETUP_ROUTES.roles.setGrants,
  requirePermission("setup.roles.manage"),
  asyncHandler(permissionController.setGrants),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.roles.setGrants}`,
  tags: ["setup", "roles", "permissions"],
  summary: "Apply a grant diff (keys added / removed) to a role.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: roleGrantsDiffSchema },
  responses: { "200": successResponse(roleGrantsSchema) },
  notes: [
    "400 KEY_NOT_GRANTABLE for setup.roles.manage (BR-AUTH-07); 400 UNKNOWN_KEY for a key not in the catalog; 403 SYSTEM_ROLE_PROTECTED for the super-admin role; 404 unknown role. Whole diff is applied in one transaction or not at all. Actor/role cache cleared. Logged with before/after.",
  ],
});

setupRouter.get(
  SETUP_ROUTES.screens.list,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.listScreens),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.screens.list}`,
  tags: ["setup", "screens"],
  summary: "List screens with the roles that see each (BR-AUTH-15).",
  auth: { type: "permission", key: "setup.roles.manage" },
  responses: { "200": successResponse(z.array(screenSchema)) },
  notes: [
    "Bounded reference data (screens come from code) — pagination intentionally omitted",
    "Ordered by menuGroup, sortOrder, key.",
  ],
});

setupRouter.patch(
  SETUP_ROUTES.screens.update,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.updateScreen),
);
register({
  method: "PATCH",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.screens.update}`,
  tags: ["setup", "screens"],
  summary: "Change a screen's label, order or menu group.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: screenUpdateSchema },
  responses: { "200": successResponse(screenSchema) },
  notes: [
    "404 unknown screen key; 400 for any other field (path, permissionKey are code-owned). Logged with before/after.",
  ],
});

setupRouter.post(
  SETUP_ROUTES.screens.setRoles,
  requirePermission("setup.roles.manage"),
  asyncHandler(pageController.setScreenRoles),
);
register({
  method: "POST",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.screens.setRoles}`,
  tags: ["setup", "screens"],
  summary: "Tick / untick roles on a screen = grant / revoke the screen's key.",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { body: screenRolesDiffSchema },
  responses: { "200": successResponse(screenSchema) },
  notes: [
    "Same grant as POST /roles/:id/grants (also opens the API). 404 unknown screen or role; 400 SCREEN_HAS_NO_KEY when permissionKey is null; 400 KEY_NOT_GRANTABLE when the key is setup.roles.manage; 403 SYSTEM_ROLE_PROTECTED for the super-admin role. One transaction, logged per role.",
  ],
});

setupRouter.get(
  SETUP_ROUTES.employees.assignableRoles,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.assignableRoles),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.assignableRoles}`,
  tags: ["setup", "employees", "roles"],
  summary: "Roles the caller may assign (BR-AUTH-16).",
  auth: { type: "permission", key: "setup.employees.manage" },
  responses: { "200": successResponse(z.array(assignableRoleSchema)) },
  notes: [
    "Bounded reference data (roles) — pagination intentionally omitted",
    "Super-admin: every role. Others: roles whose keys they all hold, never the super-admin role.",
  ],
});

setupRouter.patch(
  SETUP_ROUTES.employees.assignRole,
  requirePermission("setup.employees.manage"),
  asyncHandler(employeeController.assignRole),
);
register({
  method: "PATCH",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.employees.assignRole}`,
  tags: ["setup", "employees"],
  summary: "Assign an employee's one role (BR-AUTH-08, 16, 17).",
  auth: { type: "permission", key: "setup.employees.manage" },
  request: { body: employeeRoleAssignSchema },
  responses: { "200": successResponse(employeeSchema) },
  notes: [
    "400 if body has anything but a single roleId (e.g. roleIds[]); 404 unknown employee or role; 403 ROLE_NOT_ASSIGNABLE when the caller (non-super-admin) lacks any key of the role or targets super-admin; 409 LAST_ADMIN when it would leave no active super-admin. Actor cache cleared for that employee. Logged.",
  ],
});

setupRouter.get(
  SETUP_ROUTES.accessLog.list,
  requirePermission("setup.roles.manage"),
  asyncHandler(employeeController.accessLog),
);
register({
  method: "GET",
  path: `${SETUP_BASE_PATH}${SETUP_ROUTES.accessLog.list}`,
  tags: ["setup", "access-log"],
  summary: "Read-only access log, paginated (BR-AUTH-20).",
  auth: { type: "permission", key: "setup.roles.manage" },
  request: { query: accessLogListQuerySchema },
  responses: { "200": paginatedResponse(accessLogSchema) },
  pagination: {
    sortableFields: ["at", "action", "actorId"],
    searchable: false,
  },
  notes: [
    "No write endpoints exist. Send sortBy=at&sortDir=desc for newest first.",
  ],
});

export { setupRouter as setupRoutes };
