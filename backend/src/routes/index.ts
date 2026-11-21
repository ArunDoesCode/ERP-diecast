import { Hono } from "hono";
import type { AppEnv } from "../lib/types";
import { approvalRoutes } from "./approval";
import { assetRoutes } from "./asset";
import { authRoutes } from "./auth";
import { bomRoutes } from "./bom";
import { companyRoutes } from "./company";
import { customerRoutes } from "./customer";
import { grnRoutes } from "./grn";
import { poRoutes } from "./po";
import { prRoutes } from "./pr";
import { purchaseReturnRoutes } from "./purchaseReturn";
import { rateContractRoutes } from "./rateContract";
import { reorderRoutes } from "./reorder";
import { rfqRoutes } from "./rfq";
import { saleOrderRoutes } from "./saleOrder";
import { scoRoutes } from "./sco";
import { setupRoutes } from "./setup";
import { stockTransferRoutes } from "./stockTransfer";
import { supplierRoutes } from "./supplier";
import { supplierInvoiceRoutes } from "./supplierInvoice";
import { supplierRatingRoutes } from "./supplierRating";

const MAIN_ROUTES = {
  auth: "/auth",
  asset: "/asset",
  setup: "/setup",
  supplier: "/supplier",
  pr: "/pr",
  po: "/po",
  grn: "/grn",
  purchaseReturn: "/purchase-return",
  supplierInvoice: "/supplier-invoice",
  stockTransfer: "/stock-transfer",
  rfq: "/rfq",
  rateContract: "/rate-contract",
  approval: "/approval",
  sco: "/sco",
  bom: "/bom",
  company: "/company",
  customer: "/customers",
  saleOrder: "/sale-orders",
  reorder: "/reorder",
  supplierRating: "/supplier-rating",
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
mainRouter.route(MAIN_ROUTES.purchaseReturn, purchaseReturnRoutes);
mainRouter.route(MAIN_ROUTES.stockTransfer, stockTransferRoutes);
mainRouter.route(MAIN_ROUTES.supplierInvoice, supplierInvoiceRoutes);
mainRouter.route(MAIN_ROUTES.rfq, rfqRoutes);
mainRouter.route(MAIN_ROUTES.rateContract, rateContractRoutes);
mainRouter.route(MAIN_ROUTES.approval, approvalRoutes);
mainRouter.route(MAIN_ROUTES.sco, scoRoutes);
mainRouter.route(MAIN_ROUTES.bom, bomRoutes);
mainRouter.route(MAIN_ROUTES.company, companyRoutes);
mainRouter.route(MAIN_ROUTES.customer, customerRoutes);
mainRouter.route(MAIN_ROUTES.saleOrder, saleOrderRoutes);
mainRouter.route(MAIN_ROUTES.reorder, reorderRoutes);
mainRouter.route(MAIN_ROUTES.supplierRating, supplierRatingRoutes);
