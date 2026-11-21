import { Hono } from "hono";
import { z } from "zod";

import { supplierRatingController } from "../controller/supplierRatingController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  onTimeLineSchema,
  priceLineSchema,
  ratingSchema,
  rejectionLineSchema,
  SUPPLIER_RATING_LIST_SORT_FIELDS,
  supplierRatingIdParamSchema,
  supplierRatingLinesQuerySchema,
  supplierRatingListQuerySchema,
  supplierRatingTrendSchema,
} from "../types/supplierRating.types";
import { END_POINTS } from "./end-points";

const ROUTES = END_POINTS.supplierRating;
const BASE_PATH = "/api/supplier-rating";
const fullPath = (path: string) => `${BASE_PATH}${path}`;
const KEY = "supplier.rating.view";

const supplierRatingRouter = new Hono<AppEnv>();

supplierRatingRouter.get(
  ROUTES.list,
  requirePermission(KEY),
  asyncHandler(supplierRatingController.list),
);
register({
  method: "GET",
  path: fullPath(ROUTES.list),
  tags: ["supplier-rating"],
  summary:
    "Ratings of all suppliers, live over the last 12 IST months (BR-SRT-01..26, 29). Filters `status` (default active) and `q`; no-PO suppliers appear with null measures.",
  auth: { type: "permission", key: KEY },
  request: { query: supplierRatingListQuerySchema },
  responses: { "200": paginatedResponse(ratingSchema) },
  pagination: {
    sortableFields: [...SUPPLIER_RATING_LIST_SORT_FIELDS],
    searchable: true,
  },
});

supplierRatingRouter.get(
  ROUTES.card,
  requirePermission(KEY),
  asyncHandler(supplierRatingController.card),
);
register({
  method: "GET",
  path: fullPath(ROUTES.card),
  tags: ["supplier-rating"],
  summary:
    "One supplier's rating card (BR-SRT-01..25, 28, 29). 404 if the supplier does not exist; inactive suppliers are found.",
  auth: { type: "permission", key: KEY },
  request: { params: supplierRatingIdParamSchema },
  responses: { "200": successResponse(ratingSchema) },
});

supplierRatingRouter.get(
  ROUTES.lines,
  requirePermission(KEY),
  asyncHandler(supplierRatingController.lines),
);
register({
  method: "GET",
  path: fullPath(ROUTES.lines),
  tags: ["supplier-rating"],
  summary:
    "Lines behind one measure (BR-SRT-27, 29). `measure` on_time | rejection | price decides the row shape; sortBy is checked per measure; `verdict` only for on_time. Row shape: on_time -> onTimeLineSchema, rejection -> rejectionLineSchema, price -> priceLineSchema.",
  auth: { type: "permission", key: KEY },
  request: {
    params: supplierRatingIdParamSchema,
    query: supplierRatingLinesQuerySchema,
  },
  responses: {
    "200": paginatedResponse(
      z.union([onTimeLineSchema, rejectionLineSchema, priceLineSchema]),
    ),
  },
  pagination: {
    sortableFields: [
      "dueDate",
      "completionDate",
      "daysLate",
      "poNumber",
      "itemSku",
      "receivedDate",
      "grnNumber",
      "rejectedValuePaise",
      "poDate",
      "variancePaise",
    ],
    searchable: false,
  },
});

supplierRatingRouter.get(
  ROUTES.trend,
  requirePermission(KEY),
  asyncHandler(supplierRatingController.trend),
);
register({
  method: "GET",
  path: fullPath(ROUTES.trend),
  tags: ["supplier-rating"],
  summary:
    "12 monthly buckets, oldest first, one call (BR-SRT-28, 29). Not a list: fixed 12-row array, no pagination.",
  auth: { type: "permission", key: KEY },
  request: { params: supplierRatingIdParamSchema },
  responses: { "200": successResponse(supplierRatingTrendSchema) },
});

export { supplierRatingRouter as supplierRatingRoutes };
