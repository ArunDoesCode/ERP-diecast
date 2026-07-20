const API_Header = {
  auth: "/auth",
  files: "/files",
  setup: "/setup",
  supplier: "/supplier",
  asset: "/asset",
};
export const API_ROUTES = {
  auth: {
    login: `${API_Header.auth}/login`,
    refresh: `${API_Header.auth}/refresh`,
    logout: `${API_Header.auth}/logout`,
    me: `${API_Header.auth}/me`,
    register: `${API_Header.auth}/register`,
  },
  files: {
    presign: `${API_Header.files}/presign`,
  },
  // mirrors backend SETUP_ROUTES (list/create/update/remove per resource); :id/:roleId
  // params become functions here since api.* needs concrete URLs, not placeholders.
  setup: {
    modules: {
      list: `${API_Header.setup}/modules`,
    },
    employees: {
      list: `${API_Header.setup}/employees`,
      search: `${API_Header.setup}/employees/search`,
      create: `${API_Header.setup}/employees`,
      update: (id: number) => `${API_Header.setup}/employees/${id}`,
      remove: (id: number) => `${API_Header.setup}/employees/${id}`,
      generateQr: (id: number) => `${API_Header.setup}/employees/${id}/qr`,
    },
    roles: {
      list: `${API_Header.setup}/roles`,
      create: `${API_Header.setup}/roles`,
      update: (id: number) => `${API_Header.setup}/roles/${id}`,
      remove: (id: number) => `${API_Header.setup}/roles/${id}`,
    },
    pages: {
      list: `${API_Header.setup}/pages`,
      create: `${API_Header.setup}/pages`,
      update: (id: number) => `${API_Header.setup}/pages/${id}`,
      remove: (id: number) => `${API_Header.setup}/pages/${id}`,
    },
    permissions: {
      list: `${API_Header.setup}/permissions`,
      updateForRole: (roleId: number) =>
        `${API_Header.setup}/roles/${roleId}/permissions`,
    },
  },
  suppliers: {
    listSuppliers: `${API_Header.supplier}/listSuppliers`,
    createSupplier: `${API_Header.supplier}/createSupplier`,
    detail: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/detail`,
    updateSupplier: (supplierId: number) =>
      `${API_Header.supplier}/updateSupplier/${supplierId}`,
    listItems: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/listItems`,
    createItem: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/createItem`,
    editItem: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/editItem`,
    listServices: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/listServices`,
    createService: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/createService`,
    editService: (supplierId: number) =>
      `${API_Header.supplier}/${supplierId}/editService`,
  },
  assets: {
    items: `${API_Header.asset}/items`,
    services: `${API_Header.asset}/services`,
    machines: {
      list: `${API_Header.asset}/machines`,
      create: `${API_Header.asset}/machines`,
      update: (machineId: number) =>
        `${API_Header.asset}/machines/${machineId}`,
    },
    locations: {
      list: `${API_Header.asset}/locations`,
      create: `${API_Header.asset}/locations`,
      update: (locationId: number) =>
        `${API_Header.asset}/locations/${locationId}`,
    },
    inventory: {
      movements: {
        list: `${API_Header.asset}/inventory/movements`,
        create: `${API_Header.asset}/inventory/movements`,
      },
    },
  },
} as const;
