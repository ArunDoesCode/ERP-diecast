import { Hono } from "hono";
import { z } from "zod";

import { approvalController } from "../controller/approvalController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requirePermission } from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  approvalActionRequestSchema,
  approvalHistoryItemSchema,
  approvalPolicyListQuerySchema,
  approvalPolicySchema,
  approvalRequestDetailSchema,
  approvalRequestListItemSchema,
  approvalRequestSchema,
  approvalTrailEntrySchema,
  createApprovalPolicySchema,
  myPendingApprovalsQuerySchema,
  submitApprovalRequestSchema,
  updateApprovalPolicySchema,
} from "../types/approval.types";
import { END_POINTS } from "./end-points";

const APPROVAL_ROUTES = END_POINTS.approval;
const APPROVAL_BASE_PATH = "/api/approval";

const approvalRouter = new Hono<AppEnv>();

approvalRouter.use("*", requireAuth);

approvalRouter.get(
  APPROVAL_ROUTES.getPolicies,
  requirePermission("approval.policy.view"),
  asyncHandler(approvalController.getPolicies),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getPolicies}`,
  tags: ["approval"],
  summary: "List approval policies, paginated.",
  auth: { type: "permission", key: "approval.policy.view" },
  request: { query: approvalPolicyListQuerySchema },
  responses: { "200": paginatedResponse(approvalPolicySchema) },
  pagination: {
    sortableFields: ["name", "priority", "docType", "isActive", "createdAt"],
    searchable: true,
  },
});

approvalRouter.get(
  APPROVAL_ROUTES.getPolicyDetails,
  requirePermission("approval.policy.view"),
  asyncHandler(approvalController.getPolicyDetails),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getPolicyDetails}`,
  tags: ["approval"],
  summary: "Get a single approval policy's full definition.",
  auth: { type: "permission", key: "approval.policy.view" },
  responses: { "200": successResponse(approvalPolicySchema) },
});

approvalRouter.post(
  APPROVAL_ROUTES.createPolicy,
  requirePermission("approval.policy.manage"),
  asyncHandler(approvalController.createPolicy),
);
register({
  method: "POST",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.createPolicy}`,
  tags: ["approval"],
  summary: "Create an approval policy (priority + docType + approval chain).",
  auth: { type: "permission", key: "approval.policy.manage" },
  request: { body: createApprovalPolicySchema },
  responses: { "201": successResponse(approvalPolicySchema) },
});

approvalRouter.patch(
  APPROVAL_ROUTES.updatePolicy,
  requirePermission("approval.policy.manage"),
  asyncHandler(approvalController.updatePolicy),
);
register({
  method: "PATCH",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.updatePolicy}`,
  tags: ["approval"],
  summary: "Update an approval policy.",
  auth: { type: "permission", key: "approval.policy.manage" },
  request: { body: updateApprovalPolicySchema },
  responses: { "200": successResponse(approvalPolicySchema) },
});

approvalRouter.post(
  APPROVAL_ROUTES.submitRequest,
  requireAuth,
  asyncHandler(approvalController.submitRequest),
);
register({
  method: "POST",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.submitRequest}`,
  tags: ["approval"],
  summary:
    "Submit a PR/PO/SCO document for approval against its matching policy.",
  auth: { type: "any-authenticated" },
  request: { body: submitApprovalRequestSchema },
  responses: { "201": successResponse(approvalRequestSchema) },
});

approvalRouter.get(
  APPROVAL_ROUTES.getRequestDetails,
  requireAuth,
  asyncHandler(approvalController.getRequestDetails),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getRequestDetails}`,
  tags: ["approval"],
  summary:
    "Get an approval request's details, joined with its policy name/description.",
  auth: { type: "any-authenticated" },
  responses: { "200": successResponse(approvalRequestDetailSchema) },
});

approvalRouter.get(
  APPROVAL_ROUTES.getRequestTrail,
  requireAuth,
  asyncHandler(approvalController.getRequestTrail),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getRequestTrail}`,
  tags: ["approval"],
  summary:
    "Get the full action trail (submit/approve/reject/...) for an approval request.",
  auth: { type: "any-authenticated" },
  responses: { "200": successResponse(z.array(approvalTrailEntrySchema)) },
});

approvalRouter.post(
  APPROVAL_ROUTES.actOnRequest,
  requireAuth,
  asyncHandler(approvalController.actOnRequest),
);
register({
  method: "POST",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.actOnRequest}`,
  tags: ["approval"],
  summary:
    "Act on the current approval level of a request (approve/reject/sent_back/withdraw/cancel). `notes` is required for approve/reject/sent_back (400 APPROVAL_NOTES_REQUIRED).",
  auth: { type: "any-authenticated" },
  request: { body: approvalActionRequestSchema },
  responses: { "200": successResponse(approvalRequestSchema) },
});

approvalRouter.get(
  APPROVAL_ROUTES.getMyPendingApprovals,
  requireAuth,
  asyncHandler(approvalController.getMyPendingApprovals),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getMyPendingApprovals}`,
  tags: ["approval"],
  summary:
    "List approval requests currently pending on the caller (or, for super-admin, another employee).",
  auth: { type: "any-authenticated" },
  request: { query: myPendingApprovalsQuerySchema },
  responses: { "200": paginatedResponse(approvalRequestListItemSchema) },
  pagination: {
    sortableFields: ["requestedAt", "docType", "status"],
    searchable: false,
  },
});

approvalRouter.get(
  APPROVAL_ROUTES.getCurrentApprovalByDoc,
  requireAuth,
  asyncHandler(approvalController.getCurrentApprovalByDoc),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getCurrentApprovalByDoc}`,
  tags: ["approval"],
  summary:
    "Look up the currently open approval request for a given document, if any.",
  auth: { type: "any-authenticated" },
  responses: {
    "200": successResponse(approvalRequestListItemSchema.nullable()),
  },
});

approvalRouter.get(
  APPROVAL_ROUTES.getApprovalHistory,
  requireAuth,
  asyncHandler(approvalController.getApprovalHistory),
);
register({
  method: "GET",
  path: `${APPROVAL_BASE_PATH}${APPROVAL_ROUTES.getApprovalHistory}`,
  tags: ["approval"],
  summary:
    "Approval history of a document (BR-APR-54): all its requests newest first, each with its trail oldest first. Readable per BR-APR-51.",
  auth: { type: "any-authenticated" },
  responses: { "200": successResponse(z.array(approvalHistoryItemSchema)) },
});

export { approvalRouter as approvalRoutes };
