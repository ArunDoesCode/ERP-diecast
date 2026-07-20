import { Hono } from "hono";

import { assetController } from "../controller/assetController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import type { AppEnv } from "../lib/types";

const ASSET_ROUTES = {
  listMachines: "/machines",
  createMachine: "/machines",
  updateMachine: "/machines/:id",
  listItems: "/items",
  createItem: "/items",
  updateItem: "/items/:id",
  listServices: "/services",
  createService: "/services",
  updateService: "/services/:id",
  listInventoryMovements: "/inventory/movements",
  createInventoryMovements: "/inventory/movements",
  listLocations: "/locations",
  createLocation: "/locations",
  updateLocation: "/locations/:id",
} as const;

const assetRouter = new Hono<AppEnv>();

assetRouter.use("*", requireAuth, requireRole("super-admin", "back_office"));

assetRouter.get(
  ASSET_ROUTES.listMachines,
  asyncHandler(assetController.listMachines),
);
assetRouter.post(
  ASSET_ROUTES.createMachine,
  asyncHandler(assetController.createMachine),
);
assetRouter.patch(
  ASSET_ROUTES.updateMachine,
  asyncHandler(assetController.updateMachine),
);

assetRouter.get(
  ASSET_ROUTES.listItems,
  asyncHandler(assetController.listItems),
);
assetRouter.post(
  ASSET_ROUTES.createItem,
  asyncHandler(assetController.createItem),
);
assetRouter.patch(
  ASSET_ROUTES.updateItem,
  asyncHandler(assetController.updateItem),
);

assetRouter.get(
  ASSET_ROUTES.listServices,
  asyncHandler(assetController.listServices),
);
assetRouter.post(
  ASSET_ROUTES.createService,
  asyncHandler(assetController.createService),
);
assetRouter.patch(
  ASSET_ROUTES.updateService,
  asyncHandler(assetController.updateService),
);

assetRouter.get(
  ASSET_ROUTES.listInventoryMovements,
  asyncHandler(assetController.listInventoryMovements),
);
assetRouter.post(
  ASSET_ROUTES.createInventoryMovements,
  asyncHandler(assetController.createInventoryMovement),
);
assetRouter.get(
  ASSET_ROUTES.listLocations,
  asyncHandler(assetController.listLocations),
);
assetRouter.post(
  ASSET_ROUTES.createLocation,
  asyncHandler(assetController.createLocation),
);
assetRouter.patch(
  ASSET_ROUTES.updateLocation,
  asyncHandler(assetController.updateLocation),
);

export { assetRouter as assetRoutes };
