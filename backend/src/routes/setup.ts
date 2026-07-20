import { Hono } from "hono";

import { employeeController } from "../controller/employeeController";
import { moduleController } from "../controller/moduleController";
import { pageController } from "../controller/pageController";
import { permissionController } from "../controller/permissionController";
import { roleController } from "../controller/roleController";
import { asyncHandler } from "../lib/async-handler";
import { requireAuth, requireRole } from "../lib/auth-middleware";
import type { AppEnv } from "../lib/types";

const SETUP_ROUTES = {
  modules: {
    list: "/modules",
  },
  employees: {
    list: "/employees",
    search: "/employees/search",
    create: "/employees",
    update: "/employees/:id",
    remove: "/employees/:id",
    generateQr: "/employees/:id/qr",
  },
  roles: {
    list: "/roles",
    create: "/roles",
    update: "/roles/:id",
    remove: "/roles/:id",
  },
  pages: {
    list: "/pages",
    create: "/pages",
    update: "/pages/:id",
    remove: "/pages/:id",
  },
  permissions: {
    list: "/permissions",
    updateForRole: "/roles/:roleId/permissions",
  },
} as const;

const setupRouter = new Hono<AppEnv>();

setupRouter.use("*", requireAuth, requireRole("super-admin"));

setupRouter.get(SETUP_ROUTES.modules.list, asyncHandler(moduleController.list));

setupRouter.get(
  SETUP_ROUTES.employees.list,
  asyncHandler(employeeController.list),
);
setupRouter.get(
  SETUP_ROUTES.employees.search,
  asyncHandler(employeeController.search),
);
setupRouter.post(
  SETUP_ROUTES.employees.create,
  asyncHandler(employeeController.create),
);
setupRouter.patch(
  SETUP_ROUTES.employees.update,
  asyncHandler(employeeController.update),
);
setupRouter.delete(
  SETUP_ROUTES.employees.remove,
  asyncHandler(employeeController.remove),
);
setupRouter.post(
  SETUP_ROUTES.employees.generateQr,
  asyncHandler(employeeController.generateQr),
);

setupRouter.get(SETUP_ROUTES.roles.list, asyncHandler(roleController.list));
setupRouter.post(
  SETUP_ROUTES.roles.create,
  asyncHandler(roleController.create),
);
setupRouter.patch(
  SETUP_ROUTES.roles.update,
  asyncHandler(roleController.update),
);
setupRouter.delete(
  SETUP_ROUTES.roles.remove,
  asyncHandler(roleController.remove),
);

setupRouter.get(SETUP_ROUTES.pages.list, asyncHandler(pageController.list));
setupRouter.post(
  SETUP_ROUTES.pages.create,
  asyncHandler(pageController.create),
);
setupRouter.patch(
  SETUP_ROUTES.pages.update,
  asyncHandler(pageController.update),
);
setupRouter.delete(
  SETUP_ROUTES.pages.remove,
  asyncHandler(pageController.remove),
);

setupRouter.get(
  SETUP_ROUTES.permissions.list,
  asyncHandler(permissionController.list),
);
setupRouter.post(
  SETUP_ROUTES.permissions.updateForRole,
  asyncHandler(permissionController.updateForRole),
);

export { setupRouter as setupRoutes };
