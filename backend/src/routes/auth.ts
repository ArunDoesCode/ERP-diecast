import { Hono } from "hono";
import { z } from "zod";

import { authController } from "../controller/authController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../lib/auth-middleware";
import { rateLimiter } from "../lib/rate-limiter";
import { successResponseWithMessage } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { loginSchema } from "../types/auth.types";
import { END_POINTS } from "./end-points";

const AUTH_ROUTES = END_POINTS.auth;
const AUTH_BASE_PATH = "/api/auth";

// `me` and login `user` (BR-AUTH-13): role name is display only; access is by `permissions`.
const sessionUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  isSuperAdmin: z.boolean(),
  permissions: z.array(z.string()),
  screens: z.array(
    z.object({
      key: z.string(),
      path: z.string(),
      label: z.string(),
      menuGroup: z.string(),
      sortOrder: z.number(),
    }),
  ),
});

const authRouter = new Hono<AppEnv>();

authRouter.post(
  AUTH_ROUTES.login,
  rateLimiter({ windowMs: 15 * 60_000, max: 10 }),
  asyncHandler(authController.login),
);
register({
  method: "POST",
  path: `${AUTH_BASE_PATH}${AUTH_ROUTES.login}`,
  tags: ["auth"],
  summary:
    "Log in with email/password, returns access token + sets refresh cookie.",
  auth: { type: "public" },
  request: { body: loginSchema },
  responses: {
    "200": z.object({
      success: z.literal(true),
      message: z.string(),
      data: z.object({
        accessToken: z.string(),
        user: sessionUserSchema,
      }),
    }),
  },
});

authRouter.post(AUTH_ROUTES.refresh, asyncHandler(authController.refresh));
register({
  method: "POST",
  path: `${AUTH_BASE_PATH}${AUTH_ROUTES.refresh}`,
  tags: ["auth"],
  summary: "Exchange the refresh cookie for a new access token.",
  auth: { type: "public" },
  responses: {
    "200": successResponseWithMessage(z.object({ accessToken: z.string() })),
  },
});

authRouter.post(AUTH_ROUTES.logout, asyncHandler(authController.logout));
register({
  method: "POST",
  path: `${AUTH_BASE_PATH}${AUTH_ROUTES.logout}`,
  tags: ["auth"],
  summary: "Clear the refresh cookie and revoke the refresh token.",
  auth: { type: "public" },
  responses: {
    "200": z.object({ success: z.literal(true), message: z.string() }),
  },
});

authRouter.get(AUTH_ROUTES.me, requireAuth, asyncHandler(authController.me));
register({
  method: "GET",
  path: `${AUTH_BASE_PATH}${AUTH_ROUTES.me}`,
  tags: ["auth"],
  summary: "Return the authenticated user's own profile.",
  auth: { type: "any-authenticated" },
  responses: {
    "200": successResponseWithMessage(sessionUserSchema),
  },
});

export { authRouter as authRoutes };
