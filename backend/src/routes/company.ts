import { Hono } from "hono";

import { companySettingsController } from "../controller/companySettingsController";
import { asyncHandler } from "../lib/async-handler";
import {
  requireAnyPermission,
  requirePermission,
} from "../lib/auth-middleware";
import { paginatedResponse, successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  companySettingsHistoryQuerySchema,
  companySettingsHistoryRowSchema,
  companySettingsSchema,
  companySettingsUpsertSchema,
} from "../types/sco.types";
import {
  invoiceTolerancesSchema,
  updateInvoiceTolerancesSchema,
} from "../types/supplierInvoice.types";
import { END_POINTS } from "./end-points";

const COMPANY_ROUTES = END_POINTS.company;
const COMPANY_BASE_PATH = "/api/company";

const companyRouter = new Hono<AppEnv>();

companyRouter.get(
  COMPANY_ROUTES.settings,
  requirePermission("sco.view"),
  asyncHandler(companySettingsController.get),
);
register({
  method: "GET",
  path: `${COMPANY_BASE_PATH}${COMPANY_ROUTES.settings}`,
  tags: ["company"],
  summary:
    "Get our company details for the job-work challan (BR-SCO-09). `data` is null until saved.",
  auth: { type: "permission", key: "sco.view" },
  responses: { "200": successResponse(companySettingsSchema.nullable()) },
});

companyRouter.patch(
  COMPANY_ROUTES.settings,
  requirePermission("company.manage"),
  asyncHandler(companySettingsController.upsert),
);
register({
  method: "PATCH",
  path: `${COMPANY_BASE_PATH}${COMPANY_ROUTES.settings}`,
  tags: ["company"],
  summary:
    "Create or replace the single company-settings row (owner only, BR-SCO-09). All four fields required.",
  auth: { type: "permission", key: "company.manage" },
  request: { body: companySettingsUpsertSchema },
  responses: { "200": successResponse(companySettingsSchema) },
});

companyRouter.get(
  COMPANY_ROUTES.settingsHistory,
  requirePermission("sco.view"),
  asyncHandler(companySettingsController.listHistory),
);
register({
  method: "GET",
  path: `${COMPANY_BASE_PATH}${COMPANY_ROUTES.settingsHistory}`,
  tags: ["company"],
  summary:
    "Company settings change history, one row per changed field, newest first (BR-SCO-29). Read-only.",
  auth: { type: "permission", key: "sco.view" },
  request: { query: companySettingsHistoryQuerySchema },
  responses: {
    "200": paginatedResponse(companySettingsHistoryRowSchema),
  },
});

companyRouter.get(
  COMPANY_ROUTES.invoiceTolerances,
  requireAnyPermission("invoice.view", "invoice.manage"),
  asyncHandler(companySettingsController.getInvoiceTolerances),
);
register({
  method: "GET",
  path: `${COMPANY_BASE_PATH}${COMPANY_ROUTES.invoiceTolerances}`,
  tags: ["company"],
  summary:
    "Read the supplier-invoice match tolerances in percent (BR-SINV-32). Defaults 0% price, 0.5% weight until saved.",
  auth: {
    type: "permission",
    key: "invoice.view",
    alsoKeys: ["invoice.manage"],
  },
  responses: { "200": successResponse(invoiceTolerancesSchema) },
});

companyRouter.patch(
  COMPANY_ROUTES.invoiceTolerances,
  requirePermission("company.manage"),
  asyncHandler(companySettingsController.updateInvoiceTolerances),
);
register({
  method: "PATCH",
  path: `${COMPANY_BASE_PATH}${COMPANY_ROUTES.invoiceTolerances}`,
  tags: ["company"],
  summary:
    "Set the price and/or weight tolerance in percent (0-10, 2 decimals, at least one). Applies to the next submit. 409 SINV_COMPANY_NOT_SET before company details are saved.",
  auth: { type: "permission", key: "company.manage" },
  request: { body: updateInvoiceTolerancesSchema },
  responses: { "200": successResponse(invoiceTolerancesSchema) },
});

export { companyRouter as companyRoutes };
