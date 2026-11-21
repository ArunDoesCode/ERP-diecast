import { Hono } from "hono";

import { supplierInvoiceController } from "../controller/supplierInvoiceController";
import { asyncHandler } from "../lib/async-handler";
import {
  requireAnyPermission,
  requirePermission,
} from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  billableLinesQuerySchema,
  billableLinesSchema,
  cancelSupplierInvoiceSchema,
  createSupplierInvoiceSchema,
  releaseSupplierInvoiceSchema,
  supplierInvoiceDeletedSchema,
  supplierInvoiceDetailsSchema,
  supplierInvoiceEmptyBodySchema,
  supplierInvoiceListQuerySchema,
  supplierInvoiceListResponseSchema,
  updateSupplierInvoiceSchema,
} from "../types/supplierInvoice.types";
import { END_POINTS } from "./end-points";

const SINV_ROUTES = END_POINTS.supplierInvoice;
const SINV_BASE_PATH = "/api/supplier-invoice";
const TAGS = ["supplier-invoice"];

const supplierInvoiceRouter = new Hono<AppEnv>();

supplierInvoiceRouter.get(
  SINV_ROUTES.list,
  requireAnyPermission("invoice.view", "invoice.manage"),
  asyncHandler(supplierInvoiceController.list),
);
register({
  method: "GET",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.list}`,
  tags: TAGS,
  summary:
    "List supplier invoices, paginated. Filter by status (draft|blocked|payable|overdue|cancelled|all), supplierId, poId, grnId, q. meta adds statusCounts.",
  auth: {
    type: "permission",
    key: "invoice.view",
    alsoKeys: ["invoice.manage"],
  },
  request: { query: supplierInvoiceListQuerySchema },
  responses: { "200": supplierInvoiceListResponseSchema },
  pagination: {
    sortableFields: [
      "ourNumber",
      "invoiceNumber",
      "invoiceDate",
      "dueDate",
      "totalPaise",
      "createdAt",
    ],
    searchable: true,
  },
});

supplierInvoiceRouter.get(
  SINV_ROUTES.billableLines,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.billableLines),
);
register({
  method: "GET",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.billableLines}`,
  tags: TAGS,
  summary:
    "Billable GRN lines of a PO (optional grnId filter), prefilled at PO rate and GST. Only lines with billableQty > 0. 409 SINV_PO_NOT_BILLABLE when the PO status is not billable.",
  auth: { type: "permission", key: "invoice.manage" },
  request: { query: billableLinesQuerySchema },
  responses: { "200": successResponse(billableLinesSchema) },
});

supplierInvoiceRouter.get(
  SINV_ROUTES.details,
  requireAnyPermission("invoice.view", "invoice.manage"),
  asyncHandler(supplierInvoiceController.details),
);
register({
  method: "GET",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.details}`,
  tags: TAGS,
  summary:
    "Supplier invoice details: header, lines, mismatches, history, document flow, linked debit notes, net payable, tolerances used.",
  auth: {
    type: "permission",
    key: "invoice.view",
    alsoKeys: ["invoice.manage"],
  },
  responses: { "200": successResponse(supplierInvoiceDetailsSchema) },
});

supplierInvoiceRouter.post(
  SINV_ROUTES.create,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.create),
);
register({
  method: "POST",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.create}`,
  tags: TAGS,
  summary:
    "Create a draft supplier invoice against a PO. Computed values (line taxable, tax heads, totals, tax type, due date) are server-set; extra body keys are 400.",
  auth: { type: "permission", key: "invoice.manage" },
  request: { body: createSupplierInvoiceSchema },
  responses: { "201": successResponse(supplierInvoiceDetailsSchema) },
});

supplierInvoiceRouter.patch(
  SINV_ROUTES.update,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.update),
);
register({
  method: "PATCH",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.update}`,
  tags: TAGS,
  summary:
    "Edit a draft supplier invoice (id in body, at least one other field; lines and charges replace the set; poId is immutable).",
  auth: { type: "permission", key: "invoice.manage" },
  request: { body: updateSupplierInvoiceSchema },
  responses: { "200": successResponse(supplierInvoiceDetailsSchema) },
});

supplierInvoiceRouter.delete(
  SINV_ROUTES.remove,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.remove),
);
register({
  method: "DELETE",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.remove}`,
  tags: TAGS,
  summary:
    "Delete a draft supplier invoice (hard delete, its history rows are kept). 409 SINV_NOT_DRAFT otherwise.",
  auth: { type: "permission", key: "invoice.manage" },
  responses: { "200": successResponse(supplierInvoiceDeletedSchema) },
});

supplierInvoiceRouter.post(
  SINV_ROUTES.submit,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.submit),
);
register({
  method: "POST",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.submit}`,
  tags: TAGS,
  summary:
    "Submit a draft: run the 3-way match. Returns approved or blocked (a blocked bill is a 200 with mismatches). PO moves to invoiced when this bill covers it.",
  auth: { type: "permission", key: "invoice.manage" },
  request: { body: supplierInvoiceEmptyBodySchema },
  responses: { "200": successResponse(supplierInvoiceDetailsSchema) },
});

supplierInvoiceRouter.post(
  SINV_ROUTES.backToDraft,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.backToDraft),
);
register({
  method: "POST",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.backToDraft}`,
  tags: TAGS,
  summary:
    "Send a blocked invoice back to draft for correction; the stored mismatches are cleared.",
  auth: { type: "permission", key: "invoice.manage" },
  request: { body: supplierInvoiceEmptyBodySchema },
  responses: { "200": successResponse(supplierInvoiceDetailsSchema) },
});

supplierInvoiceRouter.post(
  SINV_ROUTES.release,
  requirePermission("invoice.release"),
  asyncHandler(supplierInvoiceController.release),
);
register({
  method: "POST",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.release}`,
  tags: TAGS,
  summary:
    "Release a blocked invoice to payable with a reason. 403 SINV_SELF_RELEASE if the caller created, edited, sent back or submitted it (super-admin included).",
  auth: { type: "permission", key: "invoice.release" },
  request: { body: releaseSupplierInvoiceSchema },
  responses: { "200": successResponse(supplierInvoiceDetailsSchema) },
});

supplierInvoiceRouter.post(
  SINV_ROUTES.cancel,
  requirePermission("invoice.manage"),
  asyncHandler(supplierInvoiceController.cancel),
);
register({
  method: "POST",
  path: `${SINV_BASE_PATH}${SINV_ROUTES.cancel}`,
  tags: TAGS,
  summary:
    "Cancel a blocked or approved invoice with a reason (3-500 chars blocked, 10-500 approved). Moves the PO invoiced -> fully_received when it was the covering invoice.",
  auth: { type: "permission", key: "invoice.manage" },
  request: { body: cancelSupplierInvoiceSchema },
  responses: { "200": successResponse(supplierInvoiceDetailsSchema) },
});

export { supplierInvoiceRouter as supplierInvoiceRoutes };
