import { Hono } from "hono";

import { stockTransferController } from "../controller/stockTransferController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  createStockTransferSchema,
  emptyBodySchema,
  reverseStockTransferSchema,
  stockTransferCancelledSchema,
  stockTransferDetailResponseSchema,
  stockTransferIdParamSchema,
  stockTransferListQuerySchema,
  stockTransferListResponseSchema,
  stockTransferPostedSchema,
  stockTransferReversedSchema,
  stockTransferSavedSchema,
  stockTransferSortFields,
  updateStockTransferSchema,
} from "../types/stockTransfer.types";
import { END_POINTS } from "./end-points";

const STR_ROUTES = END_POINTS.stockTransfer;
const STR_BASE_PATH = "/api/stock-transfer";

// "/" is the router root: Hono serves it at "/api/stock-transfer" (no trailing slash).
const fullPath = (path: string) =>
  path === "/" ? STR_BASE_PATH : `${STR_BASE_PATH}${path}`;

const stockTransferRouter = new Hono<AppEnv>();

stockTransferRouter.get(
  STR_ROUTES.list,
  requirePermission("inventory.view"),
  asyncHandler(stockTransferController.list),
);
register({
  method: "GET",
  path: fullPath(STR_ROUTES.list),
  tags: ["stock-transfer"],
  summary:
    "List stock transfers, paginated (BR-STR-27). Filter by status/sourceLocationId/destinationLocationId/itemId/fromDate/toDate. Default sort createdAt desc.",
  auth: { type: "permission", key: "inventory.view" },
  request: { query: stockTransferListQuerySchema },
  responses: { "200": stockTransferListResponseSchema },
  pagination: {
    sortableFields: [...stockTransferSortFields],
    searchable: false,
  },
});

stockTransferRouter.get(
  STR_ROUTES.details,
  requirePermission("inventory.view"),
  asyncHandler(stockTransferController.details),
);
register({
  method: "GET",
  path: fullPath(STR_ROUTES.details),
  tags: ["stock-transfer"],
  summary:
    "Stock transfer detail: header, lines (with source balance hint while draft), audit, ledger rows (BR-STR-25, 30).",
  auth: { type: "permission", key: "inventory.view" },
  request: { params: stockTransferIdParamSchema },
  responses: { "200": stockTransferDetailResponseSchema },
});

stockTransferRouter.post(
  STR_ROUTES.create,
  requirePermission("stock_transfer.manage"),
  asyncHandler(stockTransferController.create),
);
register({
  method: "POST",
  path: fullPath(STR_ROUTES.create),
  tags: ["stock-transfer"],
  summary:
    "Create a draft stock transfer (BR-STR-01..08). Any cost field or unknown key is 400.",
  auth: { type: "permission", key: "stock_transfer.manage" },
  request: { body: createStockTransferSchema },
  responses: { "201": successResponse(stockTransferSavedSchema) },
});

stockTransferRouter.patch(
  STR_ROUTES.update,
  requirePermission("stock_transfer.manage"),
  asyncHandler(stockTransferController.update),
);
register({
  method: "PATCH",
  path: fullPath(STR_ROUTES.update),
  tags: ["stock-transfer"],
  summary:
    "Edit a draft transfer (BR-STR-09). lines, if sent, replace all lines. 409 STR_NOT_DRAFT otherwise.",
  auth: { type: "permission", key: "stock_transfer.manage" },
  request: {
    params: stockTransferIdParamSchema,
    body: updateStockTransferSchema,
  },
  responses: { "200": successResponse(stockTransferSavedSchema) },
});

stockTransferRouter.post(
  STR_ROUTES.cancel,
  requirePermission("stock_transfer.manage"),
  asyncHandler(stockTransferController.cancel),
);
register({
  method: "POST",
  path: fullPath(STR_ROUTES.cancel),
  tags: ["stock-transfer"],
  summary: "Cancel a draft transfer (BR-STR-10). Empty body.",
  auth: { type: "permission", key: "stock_transfer.manage" },
  request: { params: stockTransferIdParamSchema, body: emptyBodySchema },
  responses: { "200": successResponse(stockTransferCancelledSchema) },
});

stockTransferRouter.post(
  STR_ROUTES.post,
  requirePermission("stock_transfer.manage"),
  asyncHandler(stockTransferController.post),
);
register({
  method: "POST",
  path: fullPath(STR_ROUTES.post),
  tags: ["stock-transfer"],
  summary:
    "Post a draft transfer: per line one out row at the source and one in row at the destination (BR-STR-11..18). Empty body. Nothing is saved on any error.",
  auth: { type: "permission", key: "stock_transfer.manage" },
  request: { params: stockTransferIdParamSchema, body: emptyBodySchema },
  responses: { "200": successResponse(stockTransferPostedSchema) },
});

stockTransferRouter.post(
  STR_ROUTES.reverse,
  requirePermission("stock_transfer.reverse"),
  asyncHandler(stockTransferController.reverse),
);
register({
  method: "POST",
  path: fullPath(STR_ROUTES.reverse),
  tags: ["stock-transfer"],
  summary:
    "Reverse a posted transfer with a reason: counter rows at posted cost (BR-STR-19..24).",
  auth: { type: "permission", key: "stock_transfer.reverse" },
  request: {
    params: stockTransferIdParamSchema,
    body: reverseStockTransferSchema,
  },
  responses: { "200": successResponse(stockTransferReversedSchema) },
});

export { stockTransferRouter as stockTransferRoutes };
