import { Hono } from "hono";

import { poController } from "../controller/poController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import type { AuthRequirement } from "../lib/route-registry";
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
const PO_AUTH: AuthRequirement = {
  type: "roles",
  roles: ["super-admin", "owner", "back_office"],
};

const poRouter = new Hono<AppEnv>();

poRouter.use(
  "*",
  requireAuth,
  requireRole("super-admin", "owner", "back_office"),
);

poRouter.get(PO_ROUTES.list, asyncHandler(poController.list));
register({
  method: "GET",
  path: `${PO_BASE_PATH}${PO_ROUTES.list}`,
  tags: ["po"],
  summary:
    "List purchase orders, paginated. `overdue=true` filters to dispatched/partial_received POs past their expected delivery date with remaining qty.",
  auth: PO_AUTH,
  request: { query: poListQuerySchema },
  responses: { "200": paginatedResponse(poSchema) },
  pagination: {
    sortableFields: ["id", "poNumber", "status", "createdAt"],
    searchable: true,
  },
});

poRouter.get(PO_ROUTES.details, asyncHandler(poController.details));
register({
  method: "GET",
  path: `${PO_BASE_PATH}${PO_ROUTES.details}`,
  tags: ["po"],
  summary:
    "Get a purchase order with its line items, joined back to the source PR lines for traceability.",
  auth: PO_AUTH,
  responses: { "200": successResponse(poDetailsSchema) },
});

poRouter.post(PO_ROUTES.create, asyncHandler(poController.create));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.create}`,
  tags: ["po"],
  summary:
    "Create a purchase order by drafting lines from pending PR items (full remaining PR-item quantity always used).",
  auth: PO_AUTH,
  request: { body: createPoSchema },
  responses: { "201": successResponse(poUpdateResultSchema) },
});

poRouter.patch(PO_ROUTES.update, asyncHandler(poController.update));
register({
  method: "PATCH",
  path: `${PO_BASE_PATH}${PO_ROUTES.update}`,
  tags: ["po"],
  summary:
    "Update a draft purchase order's fields and/or insert/reprice/delete line items.",
  auth: PO_AUTH,
  request: { body: updatePoSchema },
  responses: { "200": successResponse(poUpdateResultSchema) },
});

poRouter.delete(PO_ROUTES.remove, asyncHandler(poController.remove));
register({
  method: "DELETE",
  path: `${PO_BASE_PATH}${PO_ROUTES.remove}`,
  tags: ["po"],
  summary:
    "Cancel a purchase order — reverts linked PR items back to pending. " +
    "Rejected if the PO has GRN(s) recorded. `reason` is required unless " +
    "the PO is still a draft.",
  auth: PO_AUTH,
  request: { body: cancelPoSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(PO_ROUTES.send, asyncHandler(poController.markSent));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.send}`,
  tags: ["po"],
  summary:
    "Mark a PO as sent to the supplier (approved -> dispatched) and log the communication.",
  auth: PO_AUTH,
  request: { body: markPoSentSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(PO_ROUTES.reminder, asyncHandler(poController.reminder));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.reminder}`,
  tags: ["po"],
  summary: "Log a reminder sent to the supplier for an overdue PO.",
  auth: PO_AUTH,
  request: { body: logPoCommunicationSchema },
  responses: { "201": successResponse(poCommunicationSchema) },
});

poRouter.post(PO_ROUTES.escalate, asyncHandler(poController.escalate));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.escalate}`,
  tags: ["po"],
  summary: "Log an escalation action taken for an overdue PO.",
  auth: PO_AUTH,
  request: { body: logPoCommunicationSchema },
  responses: { "201": successResponse(poCommunicationSchema) },
});

poRouter.patch(PO_ROUTES.delay, asyncHandler(poController.updateDelay));
register({
  method: "PATCH",
  path: `${PO_BASE_PATH}${PO_ROUTES.delay}`,
  tags: ["po"],
  summary:
    "Record a supplier-revised delivery date and delay reason. expectedDeliveryDate is never overwritten.",
  auth: PO_AUTH,
  request: { body: updatePoDelaySchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(PO_ROUTES.confirm, asyncHandler(poController.confirmSupplier));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.confirm}`,
  tags: ["po"],
  summary:
    "Record supplier confirmation of the PO. Informational only, never blocks a status transition.",
  auth: PO_AUTH,
  request: { body: confirmPoSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(PO_ROUTES.invoice, asyncHandler(poController.markInvoiced));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.invoice}`,
  tags: ["po"],
  summary:
    "Record a supplier invoice against a fully-received PO and move it to invoiced.",
  auth: PO_AUTH,
  request: { body: markPoInvoicedSchema },
  responses: { "200": successResponse(poSchema) },
});

poRouter.post(PO_ROUTES.close, asyncHandler(poController.close));
register({
  method: "POST",
  path: `${PO_BASE_PATH}${PO_ROUTES.close}`,
  tags: ["po"],
  summary:
    "Close a PO (legal from fully_received or invoiced) — terminal, no further transitions.",
  auth: PO_AUTH,
  request: { body: closePoSchema },
  responses: { "200": successResponse(poSchema) },
});

export { poRouter as poRoutes };
