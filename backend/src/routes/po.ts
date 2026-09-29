import { Hono } from "hono";

import { poController } from "../controller/poController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  cancelPoSchema,
  closePoSchema,
  confirmPoSchema,
  createPoSchema,
  logPoCommunicationSchema,
  markPoInvoicedSchema,
  markPoSentSchema,
  poCommunicationSchema,
  poDetailsSchema,
  poListQuerySchema,
  poSchema,
  poUpdateResultSchema,
  updatePoDelaySchema,
  updatePoSchema,
} from "../types/po.types";
import { END_POINTS } from "./end-points";

const PO_ROUTES = END_POINTS.po;
const PO_BASE_PATH = "/api/po";

const poRouter = new Hono<AppEnv>();

poRouter.get(
  PO_ROUTES.list,
  requirePermission("po.manage"),
  asyncHandler(poController.list),
);
register({
  method: "GET",
  path: `${PO_BASE_PATH}${PO_ROUTES.list}`,
  tags: ["po"],
  summary:
    "List purchase orders, paginated. `overdue=true` filters to dispatched/partial_received POs past their expected delivery date with remaining qty.",
  auth: { type: "permission", key: "po.manage" },
  request: { query: poListQuerySchema },
  responses: { "200": paginatedResponse(poSchema) },
  pagination: {
    sortableFields: ["id", "poNumber", "status", "createdAt"],
    searchable: true,
  },
});

poRouter.get(
  PO_ROUTES.details,
  requirePermission("po.manage"),
  asyncHandler(poController.details),
);
register({
  method: "GET",
  path: `${PO_BASE_PATH}${PO_ROUTES.details}`,
  tags: ["po"],
  summary:
    "Get a purchase order with its line items, joined back to the source PR lines for traceability.",
  auth: { type: "permission", key: "po.manage" },
  responses: { "200": successResponse(poDetailsSchema) },
});

poRouter.post(
  PO_ROUTES.create,
  requirePermission("po.manage"),
  asyncHandler(poController.create),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.create}`,
  tags: ["po"],
  summary:
    "Create a purchase order by drafting lines from pending PR items (full remaining PR-item quantity always used).",
  auth: { type: "permission", key: "po.manage" },
  request: { body: createPoSchema },
  responses: { "201": successResponse(poUpdateResultSchema) },
});

poRouter.patch(
  PO_ROUTES.update,
  requirePermission("po.manage"),
  asyncHandler(poController.update),
);
register({
  method: "PATCH",
  path: `${PO_BASE_PATH}${PO_ROUTES.update}`,
  tags: ["po"],
  summary:
    "Update a draft purchase order's fields and/or insert/reprice/delete line items.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: updatePoSchema },
  responses: { "200": successResponse(poUpdateResultSchema) },
});

poRouter.delete(
  PO_ROUTES.remove,
  requirePermission("po.manage"),
  asyncHandler(poController.remove),
);
register({
  method: "DELETE",
  path: `${PO_BASE_PATH}${PO_ROUTES.remove}`,
  tags: ["po"],
  summary:
    "Cancel a purchase order — reverts linked PR items back to pending. " +
    "Rejected if the PO has GRN(s) recorded. `reason` is required unless " +
    "the PO is still a draft.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: cancelPoSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(
  PO_ROUTES.send,
  requirePermission("po.manage"),
  asyncHandler(poController.markSent),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.send}`,
  tags: ["po"],
  summary:
    "Mark a PO as sent to the supplier (approved -> dispatched) and log the communication.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: markPoSentSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(
  PO_ROUTES.reminder,
  requirePermission("po.manage"),
  asyncHandler(poController.reminder),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.reminder}`,
  tags: ["po"],
  summary: "Log a reminder sent to the supplier for an overdue PO.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: logPoCommunicationSchema },
  responses: { "201": successResponse(poCommunicationSchema) },
});

poRouter.post(
  PO_ROUTES.escalate,
  requirePermission("po.manage"),
  asyncHandler(poController.escalate),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.escalate}`,
  tags: ["po"],
  summary: "Log an escalation action taken for an overdue PO.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: logPoCommunicationSchema },
  responses: { "201": successResponse(poCommunicationSchema) },
});

poRouter.patch(
  PO_ROUTES.delay,
  requirePermission("po.manage"),
  asyncHandler(poController.updateDelay),
);
register({
  method: "PATCH",
  path: `${PO_BASE_PATH}${PO_ROUTES.delay}`,
  tags: ["po"],
  summary:
    "Record a supplier-revised delivery date and delay reason. expectedDeliveryDate is never overwritten.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: updatePoDelaySchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(
  PO_ROUTES.confirm,
  requirePermission("po.manage"),
  asyncHandler(poController.confirmSupplier),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.confirm}`,
  tags: ["po"],
  summary:
    "Record supplier confirmation of the PO. Informational only, never blocks a status transition.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: confirmPoSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(
  PO_ROUTES.invoice,
  requirePermission("po.manage"),
  asyncHandler(poController.markInvoiced),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.invoice}`,
  tags: ["po"],
  summary:
    "Record a supplier invoice against a fully-received PO and move it to invoiced.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: markPoInvoicedSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(
  PO_ROUTES.close,
  requirePermission("po.manage"),
  asyncHandler(poController.close),
);
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.close}`,
  tags: ["po"],
  summary:
    "Close a PO (legal from fully_received or invoiced) — terminal, no further transitions.",
  auth: { type: "permission", key: "po.manage" },
  request: { body: closePoSchema },
  responses: { "200": successResponse(poSchema) },
});

export { poRouter as poRoutes };
