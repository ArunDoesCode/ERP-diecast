import { Hono } from "hono";

import { authController } from "../controller/authController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth } from "../lib/auth-middleware";
import type { AppEnv } from "../lib/types";

const AUTH_ROUTES = {
  register: "/register",
  login: "/login",
  refresh: "/refresh",
  logout: "/logout",
  me: "/me",
} as const;

const authRouter = new Hono<AppEnv>();

authRouter.post(AUTH_ROUTES.register, asyncHandler(authController.register));
authRouter.post(AUTH_ROUTES.login, asyncHandler(authController.login));
authRouter.post(AUTH_ROUTES.refresh, asyncHandler(authController.refresh));
authRouter.post(AUTH_ROUTES.logout, asyncHandler(authController.logout));
authRouter.get(AUTH_ROUTES.me, requireAuth, asyncHandler(authController.me));

export { authRouter as authRoutes };
