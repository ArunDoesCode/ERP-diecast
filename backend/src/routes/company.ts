import { Hono } from "hono";

import { companySettingsController } from "../controller/companySettingsController";
import { asyncHandler } from "../lib/async-handler";
import { requirePermission } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import {
  companySettingsSchema,
  companySettingsUpsertSchema,
} from "../types/sco.types";
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
  requirePermission("sco.loss_override"),
  asyncHandler(companySettingsController.upsert),
);
register({
  method: "PATCH",
  path: `${COMPANY_BASE_PATH}${COMPANY_ROUTES.settings}`,
  tags: ["company"],
  summary:
    "Create or replace the single company-settings row (owner only, BR-SCO-09). All four fields required.",
  auth: { type: "permission", key: "sco.loss_override" },
  request: { body: companySettingsUpsertSchema },
  responses: { "200": successResponse(companySettingsSchema) },
});

export { companyRouter as companyRoutes };
