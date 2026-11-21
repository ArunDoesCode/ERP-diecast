import { Hono } from "hono";

import { rateContractController } from "../controller/rateContractController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  contractDetailsSchema,
  contractEmptyBodySchema,
  contractListQuerySchema,
  contractListResponseSchema,
  contractReasonBodySchema,
  createContractSchema,
  terminateContractSchema,
  updateContractSchema,
} from "../types/rateContract.types";
import { END_POINTS } from "./end-points";

const RC_ROUTES = END_POINTS.rateContract;
const RC_BASE_PATH = "/api/rate-contract";
const TAGS = ["rate-contract"];

const rateContractRouter = new Hono<AppEnv>();

rateContractRouter.get(
  RC_ROUTES.list,
  requirePermission("contract.view"),
  asyncHandler(rateContractController.list),
);
register({
  method: "GET",
  path: `${RC_BASE_PATH}${RC_ROUTES.list}`,
  tags: TAGS,
  summary:
    "List rate contracts, paginated (default createdAt desc; validTo asc with endsWithinDays). Filters status (draft|active|expired|terminated|cancelled, expired is computed), supplierId, itemId, endsWithinDays, q.",
  auth: { type: "permission", key: "contract.view" },
  request: { query: contractListQuerySchema },
  responses: { "200": contractListResponseSchema },
  pagination: {
    sortableFields: [
      "id",
      "contractNumber",
      "validFrom",
      "validTo",
      "createdAt",
      "status",
    ],
    searchable: true,
  },
});

rateContractRouter.get(
  RC_ROUTES.details,
  requirePermission("contract.view"),
  asyncHandler(rateContractController.details),
);
register({
  method: "GET",
  path: `${RC_BASE_PATH}${RC_ROUTES.details}`,
  tags: TAGS,
  summary:
    "Contract details: header, status and effectiveStatus, lines with agreed / ordered / received qty, % ordered and cap, and the POs on the contract.",
  auth: { type: "permission", key: "contract.view" },
  responses: { "200": successResponse(contractDetailsSchema) },
});

rateContractRouter.post(
  RC_ROUTES.create,
  requirePermission("contract.manage"),
  asyncHandler(rateContractController.create),
);
register({
  method: "POST",
  path: `${RC_BASE_PATH}${RC_ROUTES.create}`,
  tags: TAGS,
  summary:
    "Create a draft rate contract (1-500 lines, each item once, active item and supplier).",
  auth: { type: "permission", key: "contract.manage" },
  request: { body: createContractSchema },
  responses: { "201": successResponse(contractDetailsSchema) },
});

rateContractRouter.patch(
  RC_ROUTES.update,
  requirePermission("contract.manage"),
  asyncHandler(rateContractController.update),
);
register({
  method: "PATCH",
  path: `${RC_BASE_PATH}${RC_ROUTES.update}`,
  tags: TAGS,
  summary:
    "Edit a draft contract (id in body, full replacement of header fields and lines). 409 CONTRACT_NOT_EDITABLE unless draft.",
  auth: { type: "permission", key: "contract.manage" },
  request: { body: updateContractSchema },
  responses: { "200": successResponse(contractDetailsSchema) },
});

rateContractRouter.post(
  RC_ROUTES.activate,
  requirePermission("contract.manage"),
  asyncHandler(rateContractController.activate),
);
register({
  method: "POST",
  path: `${RC_BASE_PATH}${RC_ROUTES.activate}`,
  tags: TAGS,
  summary:
    "Activate a draft contract. 409 CONTRACT_OVERLAP (clashing contractNumber in details) when another active contract covers the same supplier, item and dates; 400 CONTRACT_DATES_INVALID when validTo is before today.",
  auth: { type: "permission", key: "contract.manage" },
  request: { body: contractEmptyBodySchema },
  responses: { "200": successResponse(contractDetailsSchema) },
});

rateContractRouter.post(
  RC_ROUTES.terminate,
  requirePermission("contract.manage"),
  asyncHandler(rateContractController.terminate),
);
register({
  method: "POST",
  path: `${RC_BASE_PATH}${RC_ROUTES.terminate}`,
  tags: TAGS,
  summary:
    "Terminate an active, not expired contract with a reason; terminatedOn defaults to today (IST) and must be today..validTo, else 400 CONTRACT_DATES_INVALID. 409 CONTRACT_INVALID_STATUS otherwise.",
  auth: { type: "permission", key: "contract.manage" },
  request: { body: terminateContractSchema },
  responses: { "200": successResponse(contractDetailsSchema) },
});

rateContractRouter.post(
  RC_ROUTES.cancel,
  requirePermission("contract.manage"),
  asyncHandler(rateContractController.cancel),
);
register({
  method: "POST",
  path: `${RC_BASE_PATH}${RC_ROUTES.cancel}`,
  tags: TAGS,
  summary:
    "Cancel a draft contract with a reason. 409 CONTRACT_NOT_EDITABLE unless draft.",
  auth: { type: "permission", key: "contract.manage" },
  request: { body: contractReasonBodySchema },
  responses: { "200": successResponse(contractDetailsSchema) },
});

export { rateContractRouter as rateContractRoutes };
