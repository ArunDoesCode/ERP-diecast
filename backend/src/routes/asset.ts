import { Hono } from "hono";

import { assetController } from "../controller/assetController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import type { AuthRequirement } from "../lib/route-registry";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  assetInventoryMovementListQuerySchema,
  assetInventoryMovementListRowSchema,
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
  assetManualMovementCreateSchema,
  assetReconciliationQuerySchema,
  assetReconciliationRowSchema,
  assetServiceCreateSchema,
  assetServiceListQuerySchema,
  assetServiceSchema,
  assetServiceUpdateSchema,
  assetStockListQuerySchema,
  assetStockRowSchema,
} from "../types/asset.types";
import { END_POINTS } from "./end-points";

const ASSET_ROUTES = END_POINTS.asset;
const ASSET_BASE_PATH = "/api/asset";
// asset.manage (seed: back_office) - masters.
const ASSET_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "back_office"],
};
// inventory.view (seed: owner, back_office, floor_supervisor).
const INVENTORY_VIEW_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office", "floor_supervisor"],
};
// inventory.adjust (seed: owner, back_office).
const INVENTORY_ADJUST_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office"],
};

const assetRouter = new Hono<AppEnv>();

assetRouter.use("*", requireAuth);
// Every route except the inventory ones below gets this guard (asset.manage).
const requireAssetManage = requireRole("super-admin", "back_office"); // perm: asset.manage

assetRouter.get(
  ASSET_ROUTES.listMachines,
  requireAssetManage,
  asyncHandler(assetController.listMachines),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listMachines}`,
  tags: ["asset"],
  summary: "List machines, paginated.",
  auth: ASSET_AUTH,
  request: { query: assetMachineListQuerySchema },
  responses: { "200": paginatedResponse(assetMachineSchema) },
  pagination: {
    sortableFields: ["name", "code", "type", "status", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createMachine,
  requireAssetManage,
  asyncHandler(assetController.createMachine),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createMachine}`,
  tags: ["asset"],
  summary: "Create a machine.",
  auth: ASSET_AUTH,
  request: { body: assetMachineCreateSchema },
  responses: { "201": successResponse(assetMachineSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateMachine,
  requireAssetManage,
  asyncHandler(assetController.updateMachine),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateMachine}`,
  tags: ["asset"],
  summary: "Update a machine.",
  auth: ASSET_AUTH,
  request: { body: assetMachineUpdateSchema },
  responses: { "200": successResponse(assetMachineSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listItems,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: inventory.view
  asyncHandler(assetController.listItems),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listItems}`,
  tags: ["asset"],
  summary: "List item master rows, paginated.",
  auth: INVENTORY_VIEW_AUTH,
  request: { query: assetItemListQuerySchema },
  responses: { "200": paginatedResponse(assetItemSchema) },
  pagination: {
    sortableFields: ["sku", "name", "category", "currentStock", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createItem,
  requireAssetManage,
  asyncHandler(assetController.createItem),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createItem}`,
  tags: ["asset"],
  summary: "Create an item master row.",
  auth: ASSET_AUTH,
  request: { body: assetItemCreateSchema },
  responses: { "201": successResponse(assetItemSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateItem,
  requireAssetManage,
  asyncHandler(assetController.updateItem),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateItem}`,
  tags: ["asset"],
  summary: "Update an item master row.",
  auth: ASSET_AUTH,
  request: { body: assetItemUpdateSchema },
  responses: { "200": successResponse(assetItemSchema) },
});

assetRouter.get(
  ASSET_ROUTES.lastRate,
  requireAssetManage,
  asyncHandler(assetController.getLastRate),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.lastRate}`,
  tags: ["asset"],
  summary:
    "Look up the rate to prefill for an item+supplier: newest approved-or-later " +
    "PO line price, then supplier catalog price, then item average cost (> 0), " +
    "then item standard rate. Returns the source.",
  auth: ASSET_AUTH,
  request: { query: assetLastRateQuerySchema },
  responses: { "200": successResponse(assetLastRateSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listServices,
  requireAssetManage,
  asyncHandler(assetController.listServices),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listServices}`,
  tags: ["asset"],
  summary: "List service master rows, paginated.",
  auth: ASSET_AUTH,
  request: { query: assetServiceListQuerySchema },
  responses: { "200": paginatedResponse(assetServiceSchema) },
  pagination: {
    sortableFields: ["code", "name", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createService,
  requireAssetManage,
  asyncHandler(assetController.createService),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createService}`,
  tags: ["asset"],
  summary: "Create a service master row.",
  auth: ASSET_AUTH,
  request: { body: assetServiceCreateSchema },
  responses: { "201": successResponse(assetServiceSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateService,
  requireAssetManage,
  asyncHandler(assetController.updateService),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateService}`,
  tags: ["asset"],
  summary: "Update a service master row.",
  auth: ASSET_AUTH,
  request: { body: assetServiceUpdateSchema },
  responses: { "200": successResponse(assetServiceSchema) },
});

assetRouter.get(
  ASSET_ROUTES.listInventoryMovements,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: inventory.view
  asyncHandler(assetController.listInventoryMovements),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listInventoryMovements}`,
  tags: ["asset"],
  summary: "List inventory movement rows, paginated.",
  auth: INVENTORY_VIEW_AUTH,
  request: { query: assetInventoryMovementListQuerySchema },
  responses: { "200": paginatedResponse(assetInventoryMovementListRowSchema) },
  pagination: {
    sortableFields: ["createdAt", "transactionType", "quantityChange"],
    searchable: false,
  },
});

assetRouter.post(
  ASSET_ROUTES.createInventoryMovements,
  requireRole("super-admin", "owner", "back_office"), // perm: inventory.adjust
  asyncHandler(assetController.createInventoryMovement),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createInventoryMovements}`,
  tags: ["asset"],
  summary:
    "Manual stock movement: stock-take (stock_adjustment, counted qty) or opening stock (opening_stock, qty + rate) only, reason required. Document reference types get 400.",
  auth: INVENTORY_ADJUST_AUTH,
  request: { body: assetManualMovementCreateSchema },
  responses: { "201": successResponse(assetInventoryMovementSchema) },
});

assetRouter.get(
  ASSET_ROUTES.inventoryStock,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: inventory.view
  asyncHandler(assetController.inventoryStock),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.inventoryStock}`,
  tags: ["asset"],
  summary:
    "Stock view: per item unit, stock, average cost, value, per-location balances, reorder flag, inactive mark.",
  auth: INVENTORY_VIEW_AUTH,
  request: { query: assetStockListQuerySchema },
  responses: { "200": paginatedResponse(assetStockRowSchema) },
  pagination: {
    sortableFields: ["sku", "name", "category", "currentStock", "valuePaise"],
    searchable: true,
  },
});

assetRouter.get(
  ASSET_ROUTES.inventoryReconciliation,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: inventory.view
  asyncHandler(assetController.inventoryReconciliation),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.inventoryReconciliation}`,
  tags: ["asset"],
  summary:
    "Stock reconciliation: items whose stock != ledger total and item+location pairs whose last balance != ledger total. Zero rows = OK.",
  auth: INVENTORY_VIEW_AUTH,
  request: { query: assetReconciliationQuerySchema },
  responses: { "200": paginatedResponse(assetReconciliationRowSchema) },
  pagination: { sortableFields: ["itemId"], searchable: false },
});

assetRouter.get(
  ASSET_ROUTES.listLocations,
  requireRole("super-admin", "owner", "back_office", "floor_supervisor"), // perm: inventory.view
  asyncHandler(assetController.listLocations),
);
register({
  method: "GET",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.listLocations}`,
  tags: ["asset"],
  summary: "List inventory locations, paginated.",
  auth: INVENTORY_VIEW_AUTH,
  request: { query: assetLocationListQuerySchema },
  responses: { "200": paginatedResponse(assetLocationSchema) },
  pagination: {
    sortableFields: ["name", "type", "createdAt"],
    searchable: true,
  },
});

assetRouter.post(
  ASSET_ROUTES.createLocation,
  requireAssetManage,
  asyncHandler(assetController.createLocation),
);
register({
  method: "POST",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.createLocation}`,
  tags: ["asset"],
  summary: "Create an inventory location.",
  auth: ASSET_AUTH,
  request: { body: assetLocationCreateSchema },
  responses: { "201": successResponse(assetLocationSchema) },
});

assetRouter.patch(
  ASSET_ROUTES.updateLocation,
  requireAssetManage,
  asyncHandler(assetController.updateLocation),
);
register({
  method: "PATCH",
  path: `${ASSET_BASE_PATH}${ASSET_ROUTES.updateLocation}`,
  tags: ["asset"],
  summary: "Update an inventory location.",
  auth: ASSET_AUTH,
  request: { body: assetLocationUpdateSchema },
  responses: { "200": successResponse(assetLocationSchema) },
});

export { assetRouter as assetRoutes };
