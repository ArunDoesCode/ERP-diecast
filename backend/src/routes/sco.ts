import { Hono } from "hono";
import { z } from "zod";

import { scoChallanController } from "../controller/scoChallanController";
import { scoController } from "../controller/scoController";
import { scoReceiptController } from "../controller/scoReceiptController";
import { scoReportController } from "../controller/scoReportController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  cancelScoSchema,
  closeScoSchema,
  createScoSchema,
  scoDetailsSchema,
  scoListQuerySchema,
  scoResponseSchema,
  updateScoSchema,
} from "../types/sco.types";
import {
  challanDetailsSchema,
  challanPrintSchema,
  challanResponseSchema,
  createChallanSchema,
  openChallanListQuerySchema,
} from "../types/scoChallan.types";
import {
  createReceiptSchema,
  qaDecisionSchema,
  receiptDetailsSchema,
  receiptResponseSchema,
  scoFullDetailsSchema,
} from "../types/scoReceipt.types";
import {
  lossLogQuerySchema,
  lossLogRowSchema,
  vendorStockQuerySchema,
  vendorStockRowSchema,
} from "../types/scoReport.types";
import { END_POINTS } from "./end-points";

const SCO_ROUTES = END_POINTS.sco;
const SCO_BASE_PATH = "/api/sco";

const scoRouter = new Hono<AppEnv>();

scoRouter.get(
  SCO_ROUTES.list,
  requirePermission("sco.view"),
  asyncHandler(scoController.list),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.list}`,
  tags: ["sco"],
  summary:
    "List subcontracting orders, paginated. Filters: `status` (comma list), `vendorId`, `q` (SCO number or vendor name).",
  auth: { type: "permission", key: "sco.view" },
  request: { query: scoListQuerySchema },
  responses: { "200": paginatedResponse(scoResponseSchema) },
  pagination: {
    sortableFields: [
      "id",
      "scoNumber",
      "status",
      "createdAt",
      "expectedReturnDate",
    ],
    searchable: true,
  },
});

scoRouter.get(
  SCO_ROUTES.details,
  requirePermission("sco.view"),
  asyncHandler(scoController.details),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.details}`,
  tags: ["sco"],
  summary:
    "Get a subcontracting order with its lines (item names, computed line value and GST, counters).",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(scoFullDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.create,
  requirePermission("sco.manage"),
  asyncHandler(scoController.create),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.create}`,
  tags: ["sco"],
  summary:
    "Create a draft subcontracting order with its lines in one call (BR-SCO-01..04). Line price/GST default to the vendor's service price list.",
  auth: { type: "permission", key: "sco.manage" },
  request: { body: createScoSchema },
  responses: { "201": successResponse(scoDetailsSchema) },
});

scoRouter.patch(
  SCO_ROUTES.update,
  requirePermission("sco.manage"),
  asyncHandler(scoController.update),
);
register({
  method: "PATCH",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.update}`,
  tags: ["sco"],
  summary:
    "Edit a draft SCO (BR-SCO-05): header fields and/or replace all lines. Non-draft = 409; `status` in body = 400.",
  auth: { type: "permission", key: "sco.manage" },
  request: { body: updateScoSchema },
  responses: { "200": successResponse(scoDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.submit,
  requirePermission("sco.manage"),
  asyncHandler(scoController.submit),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.submit}`,
  tags: ["sco"],
  summary:
    "Submit a draft SCO for approval (BR-SCO-06); only its creator. Result is pending_approval, or approved when no chain applies.",
  auth: { type: "permission", key: "sco.manage" },
  responses: { "200": successResponse(scoDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.cancel,
  requirePermission("sco.manage"),
  asyncHandler(scoController.cancel),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.cancel}`,
  tags: ["sco"],
  summary:
    "Cancel an SCO (BR-SCO-20): draft/pending_approval/approved with nothing issued, else 409. Reason 3-500 chars always; the open approval request is cancelled too.",
  auth: { type: "permission", key: "sco.manage" },
  request: { body: cancelScoSchema },
  responses: { "200": successResponse(scoDetailsSchema) },
});

// --- S2: challan (issue material), BR-SCO-07..11, 24, 25 ---

scoRouter.post(
  SCO_ROUTES.createChallan,
  requirePermission("sco.issue_receive"),
  asyncHandler(scoChallanController.create),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.createChallan}`,
  tags: ["sco"],
  summary:
    "Issue material on an approved/material_issued SCO: creates a job-work challan JWC/<FY>/<seq> and posts store -> vendor location (BR-SCO-07..10). Path :id = SCO id.",
  auth: { type: "permission", key: "sco.issue_receive" },
  request: { body: createChallanSchema },
  responses: { "201": successResponse(challanDetailsSchema) },
});

scoRouter.get(
  SCO_ROUTES.listChallans,
  requirePermission("sco.view"),
  asyncHandler(scoChallanController.listBySco),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.listChallans}`,
  tags: ["sco"],
  summary:
    "List all challans of one SCO (newest first) with days left to the return due date (BR-SCO-11). Not paginated: an SCO has few challans.",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(z.array(challanResponseSchema)) },
});

scoRouter.get(
  SCO_ROUTES.openChallans,
  requirePermission("sco.view"),
  asyncHandler(scoChallanController.listOpen),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.openChallans}`,
  tags: ["sco"],
  summary:
    "Open challans (material not fully settled) across SCOs, paginated, with days left and dueStatus ok/warning/overdue (BR-SCO-11). Filters: vendorId, scoId, dueStatus.",
  auth: { type: "permission", key: "sco.view" },
  request: { query: openChallanListQuerySchema },
  responses: { "200": paginatedResponse(challanResponseSchema) },
  pagination: {
    sortableFields: ["id", "challanNumber", "challanDate", "returnDueDate"],
    searchable: false,
  },
});

scoRouter.get(
  SCO_ROUTES.challanDetails,
  requirePermission("sco.view"),
  asyncHandler(scoChallanController.details),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.challanDetails}`,
  tags: ["sco"],
  summary:
    "Challan with lines plus print data: company settings, vendor (gstin null = unregistered), HSN per line, declaration text (BR-SCO-09, Rule 55).",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(challanPrintSchema) },
});

// --- S3: receipt + QA (BR-SCO-12..18, 22, 24, 25) ---

scoRouter.post(
  SCO_ROUTES.createReceipt,
  requirePermission("sco.issue_receive"),
  asyncHandler(scoReceiptController.create),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.createReceipt}`,
  tags: ["sco"],
  summary:
    "Receive processed/unprocessed goods back on a material_issued SCO (BR-SCO-12, 16, 17). Needs vendorChallanNo (unique per vendor, 409). Unprocessed qty returns to store at save; processed qty waits for QA. Path :id = SCO id.",
  auth: { type: "permission", key: "sco.issue_receive" },
  request: { body: createReceiptSchema },
  responses: { "201": successResponse(receiptDetailsSchema) },
});

scoRouter.get(
  SCO_ROUTES.listReceipts,
  requirePermission("sco.view"),
  asyncHandler(scoReceiptController.listBySco),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.listReceipts}`,
  tags: ["sco"],
  summary:
    "List all receipts of one SCO, newest first. Not paginated: an SCO has few receipts.",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(z.array(receiptResponseSchema)) },
});

scoRouter.get(
  SCO_ROUTES.receiptDetails,
  requirePermission("sco.view"),
  asyncHandler(scoReceiptController.details),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.receiptDetails}`,
  tags: ["sco"],
  summary:
    "Receipt with its lines (QA state, decision actor/time) and the challan settlements (BR-SCO-17).",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(receiptDetailsSchema) },
});

scoRouter.post(
  SCO_ROUTES.qaDecide,
  requirePermission("sco.qa_decide"),
  asyncHandler(scoReceiptController.decideQa),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.qaDecide}`,
  tags: ["sco"],
  summary:
    "QA decision for one receipt line (BR-SCO-13..15): accepted + rejected = processed. Posts accepted to store and rejected to scrap yard. Second decision = 409.",
  auth: { type: "permission", key: "sco.qa_decide" },
  request: { body: qaDecisionSchema },
  responses: { "200": successResponse(receiptDetailsSchema) },
});

// --- S4: close, loss, reports (BR-SCO-19, 22..25) ---

scoRouter.post(
  SCO_ROUTES.close,
  requirePermission("sco.close"),
  asyncHandler(scoController.close),
);
register({
  method: "POST",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.close}`,
  tags: ["sco"],
  summary:
    "Close a material_issued/material_received SCO (BR-SCO-19). Anything left at the vendor is written off as `sco_loss` and also needs `sco.loss_override` (403 otherwise) plus a reason 3-500 chars (400). Un-issued qty is dropped.",
  auth: { type: "permission", key: "sco.close" },
  request: { body: closeScoSchema },
  responses: { "200": successResponse(scoDetailsSchema) },
});

scoRouter.get(
  SCO_ROUTES.vendorStock,
  requirePermission("sco.view"),
  asyncHandler(scoReportController.vendorStock),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.vendorStock}`,
  tags: ["sco"],
  summary:
    "Stock at each vendor: per vendor and raw item, qty at the vendor location and value at issue cost. Filter: vendorId.",
  auth: { type: "permission", key: "sco.view" },
  request: { query: vendorStockQuerySchema },
  responses: { "200": paginatedResponse(vendorStockRowSchema) },
  pagination: {
    sortableFields: ["vendorName", "itemSku", "qty", "valuePaise"],
    searchable: false,
  },
});

scoRouter.get(
  SCO_ROUTES.lossLog,
  requirePermission("sco.view"),
  asyncHandler(scoReportController.lossLog),
);
register({
  method: "GET",
  path: `${SCO_BASE_PATH}${SCO_ROUTES.lossLog}`,
  tags: ["sco"],
  summary:
    "Loss log: one row per `sco_loss` write-off (SCO, item, qty, cost, close reason, who, when). Filters: vendorId, scoId, createdFrom, createdTo.",
  auth: { type: "permission", key: "sco.view" },
  request: { query: lossLogQuerySchema },
  responses: { "200": paginatedResponse(lossLogRowSchema) },
  pagination: {
    sortableFields: ["id", "createdAt", "qty", "costPaise"],
    searchable: false,
  },
});

export { scoRouter as scoRoutes };
