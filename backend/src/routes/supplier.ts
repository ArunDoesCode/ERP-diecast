import { Hono } from "hono";

import { supplierController } from "../controller/supplierController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import type { AppEnv } from "../lib/types";

const SUPPLIER_ROUTES = {
  createSupplier: "/createSupplier",
  detail: "/:supplierId/detail",
  listSuppliers: "/listSuppliers",
  updateSupplier: "/updateSupplier/:id",
  listItems: "/:supplierId/listItems",
  createItem: "/:supplierId/createItem",
  editItem: "/:supplierId/editItem",
  editItemLegacy: "/:supplierId/EditItem",
  listServices: "/:supplierId/listServices",
  createService: "/:supplierId/createService",
  editService: "/:supplierId/editService",
  editServiceLegacy: "/:supplierId/EditService",
} as const;

const supplierRouter = new Hono<AppEnv>();

supplierRouter.use("*", requireAuth, requireRole("super-admin", "back_office"));

supplierRouter.get(
  SUPPLIER_ROUTES.listSuppliers,
  asyncHandler(supplierController.list),
);
supplierRouter.get(
  SUPPLIER_ROUTES.listItems,
  asyncHandler(supplierController.listItems),
);
supplierRouter.get(
  SUPPLIER_ROUTES.listServices,
  asyncHandler(supplierController.listServices),
);
supplierRouter.get(
  SUPPLIER_ROUTES.detail,
  asyncHandler(supplierController.getDetails),
);
supplierRouter.post(
  SUPPLIER_ROUTES.createSupplier,
  asyncHandler(supplierController.create),
);
supplierRouter.post(
  SUPPLIER_ROUTES.createItem,
  asyncHandler(supplierController.createItem),
);
supplierRouter.post(
  SUPPLIER_ROUTES.createService,
  asyncHandler(supplierController.createService),
);
supplierRouter.patch(
  SUPPLIER_ROUTES.updateSupplier,
  asyncHandler(supplierController.update),
);
supplierRouter.patch(
  SUPPLIER_ROUTES.editItem,
  asyncHandler(supplierController.editItem),
);
supplierRouter.patch(
  SUPPLIER_ROUTES.editItemLegacy,
  asyncHandler(supplierController.editItem),
);
supplierRouter.patch(
  SUPPLIER_ROUTES.editService,
  asyncHandler(supplierController.editService),
);
supplierRouter.patch(
  SUPPLIER_ROUTES.editServiceLegacy,
  asyncHandler(supplierController.editService),
);

export { supplierRouter as supplierRoutes };
