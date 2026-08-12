import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { approvalRoutes } from "./approval";
import { assetRoutes } from "./asset";
import { authRoutes } from "./auth";
import { grnRoutes } from "./grn";
import { poRoutes } from "./po";
import { prRoutes } from "./pr";
import { setupRoutes } from "./setup";
import { supplierRoutes } from "./supplier";

const MAIN_ROUTES = {
  auth: "/auth",
  asset: "/asset",
  setup: "/setup",
  supplier: "/supplier",
  pr: "/pr",
  po: "/po",
  grn: "/grn",
  approval: "/approval",
} as const;

export { authRoutes } from "./auth";

export const mainRouter = new Hono<AppEnv>();

mainRouter.route(MAIN_ROUTES.auth, authRoutes);
mainRouter.route(MAIN_ROUTES.asset, assetRoutes);
mainRouter.route(MAIN_ROUTES.setup, setupRoutes);
mainRouter.route(MAIN_ROUTES.supplier, supplierRoutes);
mainRouter.route(MAIN_ROUTES.pr, prRoutes);
mainRouter.route(MAIN_ROUTES.po, poRoutes);
mainRouter.route(MAIN_ROUTES.grn, grnRoutes);
mainRouter.route(MAIN_ROUTES.approval, approvalRoutes);
