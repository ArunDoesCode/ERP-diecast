import { Hono } from "hono";
import { z } from "zod";

import { authController } from "../controller/authController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import { rateLimiter } from "../lib/rate-limiter";
import { successResponseWithMessage } from "../lib/response-schemas";
import { register } from "../lib/route-registry";
import type { AppEnv } from "../lib/types";
import { loginSchema, registerSchema } from "../types/auth.types";
import { END_POINTS } from "./end-points";

const AUTH_ROUTES = END_POINTS.auth;
const AUTH_BASE_PATH = "/api/auth";

// Mirrors src/lib/token.ts TokenPayload — the JWT payload shape returned by
// `me` (c.get("user")), not the DB employee row.
const tokenPayloadSchema = z.object({
  userId: z.union([z.number(), z.string()]),
  userName: z.string(),
  role: z.enum([
    "owner",
    "back_office",
    "floor_supervisor",
    "qa_inspector",
    "die_designer",
    "operator",
    "super-admin",
  ]),
  allowedPages: z.array(z.string()),
});

// authService.login's returned `user` field — a summary shape distinct from
// both the DB employee row and the JWT TokenPayload.
const loginUserSummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.string(),
  allowedPages: z.array(z.string()),
});

const authRouter = new Hono<AppEnv>();

authRouter.post(
  AUTH_ROUTES.register,
  requireAuth,
  requireRole("super-admin", "owner"),
  asyncHandler(authController.register),
);
register({
  method: "POST",
  path: `${AUTH_BASE_PATH}${AUTH_ROUTES.register}`,
  tags: ["auth"],
  summary: "Register a new desk-worker employee (email/password login).",
  auth: { type: "roles", roles: ["super-admin", "owner"] },
  request: { body: registerSchema },
  responses: {
    "201": successResponseWithMessage(
      z.object({
        id: z.number(),
        name: z.string(),
        email: z.string().nullable(),
      }),
    ),
  },
});

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
        user: loginUserSummarySchema,
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
    "200": successResponseWithMessage(tokenPayloadSchema),
  },
});

export { authRouter as authRoutes };
