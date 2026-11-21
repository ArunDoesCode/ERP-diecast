import { Hono } from "hono";

import { deliveryNoteController } from "../controller/deliveryNoteController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  cancelDeliveryNoteSchema,
  createDeliveryNoteSchema,
  deliveryNoteDetailResponseSchema,
  dispatchSettingsResponseSchema,
  noteIdParamSchema,
  noteListQuerySchema,
  noteListResponseSchema,
  pendingListQuerySchema,
  pendingListResponseSchema,
  postDeliveryNoteSchema,
  transportHistoryQuerySchema,
  transportHistoryResponseSchema,
  updateDeliveryNoteSchema,
  updateTransportSchema,
} from "../types/dispatch.types";
import { END_POINTS } from "./end-points";

const ROUTES = END_POINTS.dispatch;
const BASE_PATH = "/api/dispatch";

const dispatchRouter = new Hono<AppEnv>();

dispatchRouter.get(
  ROUTES.pending,
  requirePermission("dispatch.view"),
  asyncHandler(deliveryNoteController.pending),
);
register({
  method: "GET",
  path: `${BASE_PATH}${ROUTES.pending}`,
  tags: ["dispatch"],
  summary:
    "Pending-dispatch list: confirmed SO lines with open qty > 0, paginated (BR-DSP-39). Filter customerId/itemId/soId/locationId. meta adds customers, items (filter options) and, with soId, so (header for the note form). No prices.",
  auth: { type: "permission", key: "dispatch.view" },
  request: { query: pendingListQuerySchema },
  responses: { "200": pendingListResponseSchema },
  pagination: {
    sortableFields: ["soDate", "customerName", "itemSku", "openQty"],
    searchable: false,
  },
});

dispatchRouter.get(
  ROUTES.settings,
  requirePermission("dispatch.view"),
  asyncHandler(deliveryNoteController.settings),
);
register({
  method: "GET",
  path: `${BASE_PATH}${ROUTES.settings}`,
  tags: ["dispatch"],
  summary:
    "E-way limit (paise) and plant state code for the live e-way hint (BR-DSP-23).",
  auth: { type: "permission", key: "dispatch.view" },
  responses: { "200": dispatchSettingsResponseSchema },
});

dispatchRouter.get(
  ROUTES.list,
  requirePermission("dispatch.view"),
  asyncHandler(deliveryNoteController.list),
);
register({
  method: "GET",
  path: `${BASE_PATH}${ROUTES.list}`,
  tags: ["dispatch"],
  summary:
    "Delivery note register, paginated (BR-DSP-40). Filter dateFrom/dateTo/customerId/soId/status/ewayMissing. valuePaise only with so.view; sortBy=valuePaise without so.view is 400. meta adds customers.",
  auth: { type: "permission", key: "dispatch.view" },
  request: { query: noteListQuerySchema },
  responses: { "200": noteListResponseSchema },
  pagination: {
    sortableFields: [
      "noteDate",
      "dnNumber",
      "customerName",
      "status",
      "valuePaise",
    ],
    searchable: false,
  },
});

dispatchRouter.get(
  ROUTES.details,
  requirePermission("dispatch.view"),
  asyncHandler(deliveryNoteController.details),
);
register({
  method: "GET",
  path: `${BASE_PATH}${ROUTES.details}`,
  tags: ["dispatch"],
  summary:
    "Delivery note detail, also the print data (BR-DSP-38, 41). Price, tax and value fields only with so.view; ewayNeeded and ewayLimitPaise always.",
  auth: { type: "permission", key: "dispatch.view" },
  request: { params: noteIdParamSchema },
  responses: { "200": deliveryNoteDetailResponseSchema },
});

dispatchRouter.post(
  ROUTES.create,
  requirePermission("dispatch.manage"),
  asyncHandler(deliveryNoteController.create),
);
register({
  method: "POST",
  path: `${BASE_PATH}${ROUTES.create}`,
  tags: ["dispatch"],
  summary:
    "Create a draft delivery note from a confirmed SO (BR-DSP-01..09). Strict body: customer, price or status keys are 400.",
  auth: { type: "permission", key: "dispatch.manage" },
  request: { body: createDeliveryNoteSchema },
  responses: { "201": deliveryNoteDetailResponseSchema },
});

dispatchRouter.patch(
  ROUTES.update,
  requirePermission("dispatch.manage"),
  asyncHandler(deliveryNoteController.update),
);
register({
  method: "PATCH",
  path: `${BASE_PATH}${ROUTES.update}`,
  tags: ["dispatch"],
  summary:
    "Edit a draft: header, lines, packages, transport (BR-DSP-22). lines and packages, if sent, replace the whole list.",
  auth: { type: "permission", key: "dispatch.manage" },
  request: { params: noteIdParamSchema, body: updateDeliveryNoteSchema },
  responses: { "200": deliveryNoteDetailResponseSchema },
});

dispatchRouter.post(
  ROUTES.post,
  requirePermission("dispatch.manage"),
  asyncHandler(deliveryNoteController.post),
);
register({
  method: "POST",
  path: `${BASE_PATH}${ROUTES.post}`,
  tags: ["dispatch"],
  summary:
    "Post a draft: stock out through the ledger, SO delivered qty, DN number (BR-DSP-10..19). Body must be {}.",
  auth: { type: "permission", key: "dispatch.manage" },
  request: { params: noteIdParamSchema, body: postDeliveryNoteSchema },
  responses: { "200": deliveryNoteDetailResponseSchema },
});

dispatchRouter.post(
  ROUTES.cancelDraft,
  requirePermission("dispatch.manage"),
  asyncHandler(deliveryNoteController.cancelDraft),
);
register({
  method: "POST",
  path: `${BASE_PATH}${ROUTES.cancelDraft}`,
  tags: ["dispatch"],
  summary:
    "Cancel a draft with a reason of 3..500 characters (BR-DSP-29). Nothing posts.",
  auth: { type: "permission", key: "dispatch.manage" },
  request: { params: noteIdParamSchema, body: cancelDeliveryNoteSchema },
  responses: { "200": deliveryNoteDetailResponseSchema },
});

dispatchRouter.post(
  ROUTES.cancel,
  requirePermission("dispatch.cancel"),
  asyncHandler(deliveryNoteController.cancel),
);
register({
  method: "POST",
  path: `${BASE_PATH}${ROUTES.cancel}`,
  tags: ["dispatch"],
  summary:
    "Cancel a posted note with a reason of 3..500 characters: stock comes back at the out cost, SO delivered qty reopens (BR-DSP-30..33).",
  auth: { type: "permission", key: "dispatch.cancel" },
  request: { params: noteIdParamSchema, body: cancelDeliveryNoteSchema },
  responses: { "200": deliveryNoteDetailResponseSchema },
});

dispatchRouter.patch(
  ROUTES.transport,
  requirePermission("dispatch.manage"),
  asyncHandler(deliveryNoteController.transport),
);
register({
  method: "PATCH",
  path: `${BASE_PATH}${ROUTES.transport}`,
  tags: ["dispatch"],
  summary:
    "Change transport or add the e-way no after posting (BR-DSP-25..27). Locked key is 409 DISPATCH_NOTE_FIELD_LOCKED. Each change writes a history row.",
  auth: { type: "permission", key: "dispatch.manage" },
  request: { params: noteIdParamSchema, body: updateTransportSchema },
  responses: { "200": deliveryNoteDetailResponseSchema },
});

dispatchRouter.get(
  ROUTES.transportHistory,
  requirePermission("dispatch.view"),
  asyncHandler(deliveryNoteController.transportHistory),
);
register({
  method: "GET",
  path: `${BASE_PATH}${ROUTES.transportHistory}`,
  tags: ["dispatch"],
  summary:
    "Transport change history of one note, newest first, paginated (BR-DSP-27).",
  auth: { type: "permission", key: "dispatch.view" },
  request: { params: noteIdParamSchema, query: transportHistoryQuerySchema },
  responses: { "200": transportHistoryResponseSchema },
});

export { dispatchRouter as dispatchRoutes };
