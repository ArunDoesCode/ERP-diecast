import { Hono } from "hono";

import { homeController } from "../controller/homeController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../lib/auth-middleware";
import { successResponse } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { homeCountsQuerySchema, homeCountsSchema } from "../types/home.types";
import { END_POINTS } from "./end-points";

const HOME_ROUTES = END_POINTS.home;
const HOME_BASE_PATH = "/api/home";

const homeRouter = new Hono<AppEnv>();

homeRouter.use("*", requireAuth);

homeRouter.get(HOME_ROUTES.counts, asyncHandler(homeController.getCounts));
register({
  method: "GET",
  path: `${HOME_BASE_PATH}${HOME_ROUTES.counts}`,
  tags: ["home"],
  summary:
    "Home tile counts for the caller (BR-FF-10..33). A tile the caller has no key for is absent, never 403. Optional `tiles` csv retries / limits tiles.",
  auth: { type: "any-authenticated" },
  request: { query: homeCountsQuerySchema },
  responses: { "200": successResponse(homeCountsSchema) },
  notes: [
    "Tiles the caller lacks the key for (own key or target list key) are omitted; a failed tile is { key, error: true } with HTTP 200.",
  ],
});

export { homeRouter as homeRoutes };
