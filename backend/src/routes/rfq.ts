import { Hono } from "hono";

import { rfqController } from "../controller/rfqController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  awardResultSchema,
  awardSchema,
  createQuoteSchema,
  createRfqSchema,
  prLinesListResponseSchema,
  prLinesQuerySchema,
  rfqComparisonSchema,
  rfqCreatedSchema,
  rfqDetailsSchema,
  rfqEmptyBodySchema,
  rfqHeaderSchema,
  rfqListQuerySchema,
  rfqListResponseSchema,
  rfqPrintSchema,
  rfqQuoteDetailsSchema,
  rfqReasonBodySchema,
  updateQuoteSchema,
  updateRfqSchema,
} from "../types/rfq.types";
import { END_POINTS } from "./end-points";

const RFQ_ROUTES = END_POINTS.rfq;
const RFQ_BASE_PATH = "/api/rfq";
const TAGS = ["rfq"];

const rfqRouter = new Hono<AppEnv>();

// Static paths (pr-lines, getrfqs, quotes/:quoteId) come before the /:id routes.
rfqRouter.get(
  RFQ_ROUTES.prLines,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.prLines),
);
register({
  method: "GET",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.prLines}`,
  tags: TAGS,
  summary:
    "Pick list of pending PR lines (approved or partial_ordered PRs) for a new RFQ, with onOpenRfq / openRfqId / openRfqNumber. Filters prId, itemId, onOpenRfq, q.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { query: prLinesQuerySchema },
  responses: { "200": prLinesListResponseSchema },
  pagination: {
    sortableFields: ["prNumber", "itemId", "expectedDate", "id"],
    searchable: true,
  },
});

rfqRouter.get(
  RFQ_ROUTES.list,
  requirePermission("rfq.view"),
  asyncHandler(rfqController.list),
);
register({
  method: "GET",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.list}`,
  tags: TAGS,
  summary:
    "List RFQs, paginated (default createdAt desc). Filters status, supplierId, from / to (created IST days), q (number, notes). Rows add supplierCount, quotedCount, lineCount.",
  auth: { type: "permission", key: "rfq.view" },
  request: { query: rfqListQuerySchema },
  responses: { "200": rfqListResponseSchema },
  pagination: {
    sortableFields: ["id", "rfqNumber", "dueDate", "createdAt", "status"],
    searchable: true,
  },
});

rfqRouter.get(
  RFQ_ROUTES.details,
  requirePermission("rfq.view"),
  asyncHandler(rfqController.details),
);
register({
  method: "GET",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.details}`,
  tags: TAGS,
  summary:
    "RFQ details: header, suppliers, lines (award, PO number and status, PR-line-cancelled flag), quote headers. lineRates (last PO rate, contract rates) only for callers with po.manage or contract.view.",
  auth: { type: "permission", key: "rfq.view" },
  responses: { "200": successResponse(rfqDetailsSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.create,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.create),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.create}`,
  tags: TAGS,
  summary:
    "Create a draft RFQ from pending PR lines and 1-10 suppliers. Qty, uom and item are copied from the PR line, never sent.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: createRfqSchema },
  responses: { "201": successResponse(rfqCreatedSchema) },
});

rfqRouter.patch(
  RFQ_ROUTES.update,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.update),
);
register({
  method: "PATCH",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.update}`,
  tags: TAGS,
  summary:
    "Edit a draft RFQ (id in body, at least one other field): dueDate, notes, add / remove suppliers and PR lines. 409 RFQ_NOT_EDITABLE unless draft.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: updateRfqSchema },
  responses: { "200": successResponse(rfqCreatedSchema) },
});

rfqRouter.get(
  RFQ_ROUTES.quoteDetails,
  requirePermission("rfq.view"),
  asyncHandler(rfqController.quoteDetails),
);
register({
  method: "GET",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.quoteDetails}`,
  tags: TAGS,
  summary:
    "One supplier quote with its lines (computed value, tax, landed rate).",
  auth: { type: "permission", key: "rfq.view" },
  responses: { "200": successResponse(rfqQuoteDetailsSchema) },
});

rfqRouter.patch(
  RFQ_ROUTES.updateQuote,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.updateQuote),
);
register({
  method: "PATCH",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.updateQuote}`,
  tags: TAGS,
  summary:
    "Edit a draft quote: replaces all its lines (no supplierId). 409 QUOTE_NOT_EDITABLE when submitted or cancelled.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: updateQuoteSchema },
  responses: { "200": successResponse(rfqQuoteDetailsSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.submitQuote,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.submitQuote),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.submitQuote}`,
  tags: TAGS,
  summary:
    "Submit a draft quote (draft to submitted). Sets isLate when the submit day is after the RFQ due date. 400 QUOTE_EMPTY when no line is quoted.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: rfqEmptyBodySchema },
  responses: { "200": successResponse(rfqQuoteDetailsSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.cancelQuote,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.cancelQuote),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.cancelQuote}`,
  tags: TAGS,
  summary:
    "Cancel a quote with a reason. A submitted quote on a sent RFQ also needs rfq.award (checked in the service, 403 PERMISSION_DENIED with key). 409 QUOTE_AWARDED when any line is awarded.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: rfqReasonBodySchema },
  responses: { "200": successResponse(rfqQuoteDetailsSchema) },
  notes: ["Service-level key: rfq.award for a submitted quote after send."],
});

rfqRouter.post(
  RFQ_ROUTES.send,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.send),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.send}`,
  tags: TAGS,
  summary:
    "Send a draft RFQ (draft to sent). 409 RFQ_LINE_STALE / SUPPLIER_INACTIVE_STALE name the id in details; 409 RFQ_INVALID_STATUS otherwise.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: rfqEmptyBodySchema },
  responses: { "200": successResponse(rfqHeaderSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.cancel,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.cancel),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.cancel}`,
  tags: TAGS,
  summary:
    "Cancel an RFQ with a reason. 409 RFQ_HAS_AWARD when a line is awarded; 409 RFQ_INVALID_STATUS when final.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: rfqReasonBodySchema },
  responses: { "200": successResponse(rfqHeaderSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.close,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.close),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.close}`,
  tags: TAGS,
  summary:
    "Close an RFQ with a reason: open lines are dropped, draft quotes cancelled, submitted ones not_awarded. 409 RFQ_INVALID_STATUS when final.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: rfqReasonBodySchema },
  responses: { "200": successResponse(rfqHeaderSchema) },
});

rfqRouter.get(
  RFQ_ROUTES.print,
  requirePermission("rfq.view"),
  asyncHandler(rfqController.print),
);
register({
  method: "GET",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.print}`,
  tags: TAGS,
  summary:
    "Print data, one sheet per supplier with no rates and no other supplier. Allowed from sent onward; draft or cancelled gives 409 RFQ_INVALID_STATUS.",
  auth: { type: "permission", key: "rfq.view" },
  responses: { "200": successResponse(rfqPrintSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.createQuote,
  requirePermission("rfq.manage"),
  asyncHandler(rfqController.createQuote),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.createQuote}`,
  tags: TAGS,
  summary:
    "Enter a draft quote for a supplier on a sent / partially_awarded RFQ. One entry per RFQ line (missing = not quoted). No value, tax or landed field is accepted; they are computed.",
  auth: { type: "permission", key: "rfq.manage" },
  request: { body: createQuoteSchema },
  responses: { "201": successResponse(rfqQuoteDetailsSchema) },
});

rfqRouter.get(
  RFQ_ROUTES.comparison,
  requirePermission("rfq.view"),
  asyncHandler(rfqController.comparison),
);
register({
  method: "GET",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.comparison}`,
  tags: TAGS,
  summary:
    "Comparison grid computed on read: lines x suppliers with landed rate, lowest flag, eligibility, last PO rate and contract rate (the last two only for po.manage or contract.view).",
  auth: { type: "permission", key: "rfq.view" },
  responses: { "200": successResponse(rfqComparisonSchema) },
});

rfqRouter.post(
  RFQ_ROUTES.award,
  requirePermission("rfq.award"),
  requirePermission("po.manage"),
  asyncHandler(rfqController.award),
);
register({
  method: "POST",
  path: `${RFQ_BASE_PATH}${RFQ_ROUTES.award}`,
  tags: TAGS,
  summary:
    "Award RFQ lines to quote lines and create the draft POs in one transaction (all or nothing). Needs rfq.award, then po.manage.",
  auth: { type: "permission", key: "rfq.award" },
  request: { body: awardSchema },
  responses: { "201": successResponse(awardResultSchema) },
  notes: [
    "Second route guard: po.manage (403 PERMISSION_DENIED with key po.manage). rfq.award is checked first.",
  ],
});

export { rfqRouter as rfqRoutes };
