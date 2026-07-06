export const SETUP_ROUTES = {
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
