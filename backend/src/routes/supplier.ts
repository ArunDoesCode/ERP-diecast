import { Hono } from "hono";

import { supplierController } from "../controller/supplierController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import type { AuthRequirement } from "../lib/route-registry";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  supplierCreateSchema,
  supplierDetailSchema,
  supplierItemBatchEditSchema,
  supplierItemCreateSchema,
  supplierItemEditResponseSchema,
  supplierItemListQuerySchema,
  supplierItemSchema,
  supplierListQuerySchema,
  supplierSchema,
  supplierServiceBatchEditSchema,
  supplierServiceCreateSchema,
  supplierServiceEditResponseSchema,
  supplierServiceListQuerySchema,
  supplierServiceSchema,
  supplierUpdateSchema,
} from "../types/supplier.types";
import { END_POINTS } from "./end-points";

const SUPPLIER_ROUTES = END_POINTS.supplier;
const SUPPLIER_BASE_PATH = "/api/supplier";
const SUPPLIER_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "back_office"],
};

const supplierRouter = new Hono<AppEnv>();

supplierRouter.use("*", requireAuth, requireRole("super-admin", "back_office"));

supplierRouter.get(
  SUPPLIER_ROUTES.listSuppliers,
  asyncHandler(supplierController.list),
);
register({
  method: "GET",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.listSuppliers}`,
  tags: ["supplier"],
  summary: "List suppliers, paginated.",
  auth: SUPPLIER_AUTH,
  request: { query: supplierListQuerySchema },
  responses: { "200": paginatedResponse(supplierSchema) },
  pagination: {
    sortableFields: ["name", "type", "contactPerson", "isActive", "createdAt"],
    searchable: true,
  },
});

supplierRouter.get(
  SUPPLIER_ROUTES.listItems,
  asyncHandler(supplierController.listItems),
);
register({
  method: "GET",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.listItems}`,
  tags: ["supplier"],
  summary: "List a supplier's item catalog entries, paginated.",
  auth: SUPPLIER_AUTH,
  request: { query: supplierItemListQuerySchema },
  responses: { "200": paginatedResponse(supplierItemSchema) },
  pagination: { sortableFields: [], searchable: true },
});

supplierRouter.get(
  SUPPLIER_ROUTES.listServices,
  asyncHandler(supplierController.listServices),
);
register({
  method: "GET",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.listServices}`,
  tags: ["supplier"],
  summary: "List a supplier's service catalog entries, paginated.",
  auth: SUPPLIER_AUTH,
  request: { query: supplierServiceListQuerySchema },
  responses: { "200": paginatedResponse(supplierServiceSchema) },
  pagination: { sortableFields: [], searchable: true },
});

supplierRouter.get(
  SUPPLIER_ROUTES.detail,
  asyncHandler(supplierController.getDetails),
);
register({
  method: "GET",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.detail}`,
  tags: ["supplier"],
  summary: "Get a supplier's master record plus item/service counts.",
  auth: SUPPLIER_AUTH,
  responses: { "200": successResponse(supplierDetailSchema) },
});

supplierRouter.post(
  SUPPLIER_ROUTES.createSupplier,
  asyncHandler(supplierController.create),
);
register({
  method: "POST",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.createSupplier}`,
  tags: ["supplier"],
  summary: "Create a supplier, optionally seeding its item catalog.",
  auth: SUPPLIER_AUTH,
  request: { body: supplierCreateSchema },
  responses: { "201": successResponse(supplierSchema) },
});

supplierRouter.post(
  SUPPLIER_ROUTES.createItem,
  asyncHandler(supplierController.createItem),
);
register({
  method: "POST",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.createItem}`,
  tags: ["supplier"],
  summary: "Add a single item catalog entry to a supplier.",
  auth: SUPPLIER_AUTH,
  request: { body: supplierItemCreateSchema },
  responses: { "201": successResponse(supplierItemSchema) },
});

supplierRouter.post(
  SUPPLIER_ROUTES.createService,
  asyncHandler(supplierController.createService),
);
register({
  method: "POST",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.createService}`,
  tags: ["supplier"],
  summary: "Add a single service catalog entry to a supplier.",
  auth: SUPPLIER_AUTH,
  request: { body: supplierServiceCreateSchema },
  responses: { "201": successResponse(supplierServiceSchema) },
});

supplierRouter.patch(
  SUPPLIER_ROUTES.updateSupplier,
  asyncHandler(supplierController.update),
);
register({
  method: "PATCH",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.updateSupplier}`,
  tags: ["supplier"],
  summary:
    "Update a supplier — discriminated by mode: master fields or a single supplier-item row.",
  auth: SUPPLIER_AUTH,
  request: { body: supplierUpdateSchema },
  responses: { "200": successResponse(supplierSchema) },
});

supplierRouter.patch(
  SUPPLIER_ROUTES.editItem,
  asyncHandler(supplierController.editItem),
);
register({
  method: "PATCH",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.editItem}`,
  tags: ["supplier"],
  summary: "Batch-edit one or more of a supplier's item catalog entries.",
  auth: SUPPLIER_AUTH,
  request: { body: supplierItemBatchEditSchema },
  responses: { "200": supplierItemEditResponseSchema },
  notes: [
    "response spreads service result fields directly ({success, data, summary}), not {success,data} — documented deviation, not normalized",
  ],
});

supplierRouter.patch(
  SUPPLIER_ROUTES.editService,
  asyncHandler(supplierController.editService),
);
register({
  method: "PATCH",
  path: `${SUPPLIER_BASE_PATH}${SUPPLIER_ROUTES.editService}`,
  tags: ["supplier"],
  summary: "Batch-edit one or more of a supplier's service catalog entries.",
  auth: SUPPLIER_AUTH,
  request: { body: supplierServiceBatchEditSchema },
  responses: { "200": supplierServiceEditResponseSchema },
  notes: [
    "response spreads service result fields directly ({success, data, summary}), not {success,data} — documented deviation, not normalized",
  ],
});

export { supplierRouter as supplierRoutes };
