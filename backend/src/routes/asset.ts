import { Hono } from "hono";

import { assetController } from "../controller/assetController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  assetInventoryMovementCreateSchema,
  assetInventoryMovementListQuerySchema,
  assetInventoryMovementSchema,
  assetItemCreateSchema,
  assetItemListQuerySchema,
  assetItemSchema,
  assetItemUpdateSchema,
  assetLastRateQuerySchema,
  assetLastRateSchema,
  assetLocationCreateSchema,
  assetLocationListQuerySchema,
  assetLocationSchema,
  assetLocationUpdateSchema,
  assetMachineCreateSchema,
  assetMachineListQuerySchema,
  assetMachineSchema,
  assetMachineUpdateSchema,
  assetServiceCreateSchema,
  assetServiceListQuerySchema,
  assetServiceSchema,
  assetServiceUpdateSchema,
} from "../types/asset.types";
import { END_POINTS } from "./end-points";

const ASSET_ROUTES = END_POINTS.asset;
const ASSET_BASE_PATH = "/api/asset";

const assetRouter = new Hono<AppEnv>();

assetRouter.get(
  ASSET_ROUTES.listMachines,
  requireAuth,
  asyncHandler(assetController.listMachines),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listMachines}`,
  tags: ["asset"],
  summary: "List machines, paginated.",
  auth: { type: "any-authenticated" },
  request: { query: assetMachineListQuerySchema },
  responses: { "200": paginatedResponse(assetMachineSchema) },
  pagination: {
    sortableFields: ["name", "type", "status", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createMachine,
  requirePermission("asset.manage"),
  asyncHandler(assetController.createMachine),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createMachine}`,
  tags: ["asset"],
  summary: "Create a machine.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetMachineCreateSchema },
  responses: { "201": successResponse(assetMachineSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateMachine,
  requirePermission("asset.manage"),
  asyncHandler(assetController.updateMachine),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateMachine}`,
  tags: ["asset"],
  summary: "Update a machine.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetMachineUpdateSchema },
  responses: { "200": successResponse(assetMachineSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listItems,
  requirePermission("inventory.view"),
  asyncHandler(assetController.listItems),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listItems}`,
  tags: ["asset"],
  summary: "List item master rows, paginated.",
  auth: { type: "permission", key: "inventory.view" },
  request: { query: assetItemListQuerySchema },
  responses: { "200": paginatedResponse(assetItemSchema) },
  pagination: {
    sortableFields: ["sku", "name", "category", "currentStock", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createItem,
  requirePermission("asset.manage"),
  asyncHandler(assetController.createItem),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createItem}`,
  tags: ["asset"],
  summary: "Create an item master row.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetItemCreateSchema },
  responses: { "201": successResponse(assetItemSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateItem,
  requirePermission("asset.manage"),
  asyncHandler(assetController.updateItem),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateItem}`,
  tags: ["asset"],
  summary: "Update an item master row.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetItemUpdateSchema },
  responses: { "200": successResponse(assetItemSchema) },
});

assetRouter.get(
  ASSET_ROUTES.lastRate,
  requirePermission("inventory.view"),
  asyncHandler(assetController.getLastRate),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.lastRate}`,
  tags: ["asset"],
  summary:
    "Look up the rate to prefill for an item+supplier: latest PO price, " +
    "falling back to the supplier's catalog price, falling back to the " +
    "item master's average cost estimate.",
  auth: { type: "permission", key: "inventory.view" },
  request: { query: assetLastRateQuerySchema },
  responses: { "200": successResponse(assetLastRateSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listServices,
  requirePermission("asset.manage"),
  asyncHandler(assetController.listServices),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listServices}`,
  tags: ["asset"],
  summary: "List service master rows, paginated.",
  auth: { type: "permission", key: "asset.manage" },
  request: { query: assetServiceListQuerySchema },
  responses: { "200": paginatedResponse(assetServiceSchema) },
  pagination: {
    sortableFields: ["code", "name", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createService,
  requirePermission("asset.manage"),
  asyncHandler(assetController.createService),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createService}`,
  tags: ["asset"],
  summary: "Create a service master row.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetServiceCreateSchema },
  responses: { "201": successResponse(assetServiceSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateService,
  requirePermission("asset.manage"),
  asyncHandler(assetController.updateService),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateService}`,
  tags: ["asset"],
  summary: "Update a service master row.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetServiceUpdateSchema },
  responses: { "200": successResponse(assetServiceSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listInventoryMovements,
  requirePermission("inventory.view"),
  asyncHandler(assetController.listInventoryMovements),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listInventoryMovements}`,
  tags: ["asset"],
  summary: "List inventory movement rows, paginated.",
  auth: { type: "permission", key: "inventory.view" },
  request: { query: assetInventoryMovementListQuerySchema },
  responses: { "200": paginatedResponse(assetInventoryMovementSchema) },
  pagination: {
    sortableFields: ["createdAt", "transactionType", "quantityChange"],
    searchable: false,
  },
});

assetRouter.post(
  ASSET_ROUTES.createInventoryMovements,
  requirePermission("inventory.adjust"),
  asyncHandler(assetController.createInventoryMovement),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createInventoryMovements}`,
  tags: ["asset"],
  summary: "Record an inventory movement (in/out/adjustment).",
  auth: { type: "permission", key: "inventory.adjust" },
  request: { body: assetInventoryMovementCreateSchema },
  responses: { "201": successResponse(assetInventoryMovementSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listLocations,
  requirePermission("asset.manage"),
  asyncHandler(assetController.listLocations),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listLocations}`,
  tags: ["asset"],
  summary: "List inventory locations, paginated.",
  auth: { type: "permission", key: "asset.manage" },
  request: { query: assetLocationListQuerySchema },
  responses: { "200": paginatedResponse(assetLocationSchema) },
  pagination: {
    sortableFields: ["name", "type", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createLocation,
  requirePermission("asset.manage"),
  asyncHandler(assetController.createLocation),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createLocation}`,
  tags: ["asset"],
  summary: "Create an inventory location.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetLocationCreateSchema },
  responses: { "201": successResponse(assetLocationSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateLocation,
  requirePermission("asset.manage"),
  asyncHandler(assetController.updateLocation),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateLocation}`,
  tags: ["asset"],
  summary: "Update an inventory location.",
  auth: { type: "permission", key: "asset.manage" },
  request: { body: assetLocationUpdateSchema },
  responses: { "200": successResponse(assetLocationSchema) },
});

export { assetRouter as assetRoutes };
