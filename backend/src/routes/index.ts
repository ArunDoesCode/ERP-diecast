import { Hono } from "hono";
import { authRoutes } from "./auth";
import { assetRoutes } from "./asset";
import { setupRoutes } from "./setup";
import { supplierRoutes } from "./supplier";
import { AppEnv } from "../lib/types";

const MAIN_ROUTES = {
  auth: "/auth",
  asset: "/asset",
  setup: "/setup",
  supplier: "/supplier",
} as const;

export { authRoutes } from "./auth";

export const mainRouter = new Hono<AppEnv>();

mainRouter.route(MAIN_ROUTES.auth, authRoutes);
mainRouter.route(MAIN_ROUTES.asset, assetRoutes);
mainRouter.route(MAIN_ROUTES.setup, setupRoutes);
mainRouter.route(MAIN_ROUTES.supplier, supplierRoutes);
