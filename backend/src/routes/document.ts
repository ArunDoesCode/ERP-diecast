import { Hono } from "hono";

import { documentController } from "../controller/documentController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { panelParamSchema, panelSchema } from "../types/document.types";
import { END_POINTS } from "./end-points";

const DOCUMENT_ROUTES = END_POINTS.document;
const DOCUMENT_BASE_PATH = "/api/document";

const documentRouter = new Hono<AppEnv>();

documentRouter.use("*", requireAuth);

documentRouter.get(
  DOCUMENT_ROUTES.panel,
  asyncHandler(documentController.getPanel),
);
register({
  method: "GET",
  path: `${DOCUMENT_BASE_PATH}${DOCUMENT_ROUTES.panel}`,
  tags: ["document"],
  summary:
    "Side panel of a PR / PO / GRN: totals, approvals, linked documents, history (BR-FF-42, 50..55). Service enforces doc key, approval.view_all or the read-via-approval rule.",
  auth: { type: "any-authenticated" },
  request: { params: panelParamSchema },
  responses: { "200": successResponse(panelSchema) },
  notes: [
    "403 FORBIDDEN (same body whether or not the id exists) before any lookup; 404 NOT_FOUND only after access passed.",
  ],
});

export { documentRouter as documentRoutes };
