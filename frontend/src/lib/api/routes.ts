const API_Header = {
	auth: "/auth",
	setup: "/setup",
	approval: "/approval",
	supplier: "/supplier",
	asset: "/asset",
	pr: "/pr",
	po: "/po",
	grn: "/grn",
	sco: "/sco",
	company: "/company",
};
export const API_ROUTES = {
	auth: {
		login: `${API_Header.auth}/login`,
		refresh: `${API_Header.auth}/refresh`,
		logout: `${API_Header.auth}/logout`,
		me: `${API_Header.auth}/me`,
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
			assignableRoles: `${API_Header.setup}/employees/assignable-roles`,
			assignRole: (id: number) => `${API_Header.setup}/employees/${id}/role`,
		},
		roles: {
			list: `${API_Header.setup}/roles`,
			create: `${API_Header.setup}/roles`,
			update: (id: number) => `${API_Header.setup}/roles/${id}`,
			remove: (id: number) => `${API_Header.setup}/roles/${id}`,
			copy: (id: number) => `${API_Header.setup}/roles/${id}/copy`,
			grants: (id: number) => `${API_Header.setup}/roles/${id}/grants`,
		},
		screens: {
			list: `${API_Header.setup}/screens`,
			update: (key: string) => `${API_Header.setup}/screens/${key}`,
			roles: (key: string) => `${API_Header.setup}/screens/${key}/roles`,
		},
		accessLog: {
			list: `${API_Header.setup}/access-log`,
		},
	},
	approval: {
		getPolicies: `${API_Header.approval}/getPolicies`,
		getPolicyDetails: (id: number) =>
			`${API_Header.approval}/getPolicyDetails/${id}`,
		createPolicy: `${API_Header.approval}/createPolicy`,
		updatePolicy: (id: number) => `${API_Header.approval}/updatePolicy/${id}`,
		submitRequest: `${API_Header.approval}/submitRequest`,
		getRequestDetails: (id: number) =>
			`${API_Header.approval}/getRequestDetails/${id}`,
		getRequestTrail: (id: number) =>
			`${API_Header.approval}/getRequestTrail/${id}`,
		actOnRequest: (id: number) => `${API_Header.approval}/actOnRequest/${id}`,
		getMyPendingApprovals: `${API_Header.approval}/getMyPendingApprovals`,
		getApprovalHistory: (docType: string, docId: number) =>
			`${API_Header.approval}/getApprovalHistory/${docType}/${docId}`,
		getCurrentApprovalByDoc: (docType: string, docId: number) =>
			`${API_Header.approval}/getCurrentApprovalByDoc/${docType}/${docId}`,
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
		history: (supplierId: number) =>
			`${API_Header.supplier}/${supplierId}/history`,
	},
	assets: {
		items: `${API_Header.asset}/items`,
		itemLastRate: (itemId: number) =>
			`${API_Header.asset}/items/${itemId}/last-rate`,
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
			stock: `${API_Header.asset}/inventory/stock`,
			movements: {
				list: `${API_Header.asset}/inventory/movements`,
				create: `${API_Header.asset}/inventory/movements`,
			},
		},
	},
	purchaseRequisitions: {
		list: `${API_Header.pr}/getprs`,
		detail: (prId: number) => `${API_Header.pr}/getprdetails/${prId}`,
		create: `${API_Header.pr}/createpr`,
		update: `${API_Header.pr}/updatepr`,
		remove: (prId: number) => `${API_Header.pr}/deletepr/${prId}`,
		cancelLine: (prId: number, lineId: number) =>
			`${API_Header.pr}/${prId}/lines/${lineId}/cancel`,
	},
	purchaseOrders: {
		list: `${API_Header.po}/getpos`,
		detail: (poId: number) => `${API_Header.po}/getpodetails/${poId}`,
		create: `${API_Header.po}/createpo`,
		update: `${API_Header.po}/updatepo`,
		remove: (poId: number) => `${API_Header.po}/deletepo/${poId}`,
		send: (poId: number) => `${API_Header.po}/${poId}/send`,
		reminder: (poId: number) => `${API_Header.po}/${poId}/reminder`,
		escalate: (poId: number) => `${API_Header.po}/${poId}/escalate`,
		delay: (poId: number) => `${API_Header.po}/${poId}/delay`,
		confirm: (poId: number) => `${API_Header.po}/${poId}/confirm`,
		invoice: (poId: number) => `${API_Header.po}/${poId}/invoice`,
		close: (poId: number) => `${API_Header.po}/${poId}/close`,
		shortClose: (poId: number) => `${API_Header.po}/${poId}/short-close`,
		communications: (poId: number) => `${API_Header.po}/${poId}/communications`,
	},
	grn: {
		list: `${API_Header.grn}/getgrns`,
		detail: (grnId: number) => `${API_Header.grn}/getgrndetails/${grnId}`,
		create: `${API_Header.grn}/creategrn`,
		update: `${API_Header.grn}/updategrn`,
		remove: (grnId: number) => `${API_Header.grn}/deletegrn/${grnId}`,
		qaDecision: (grnId: number, lineId: number) =>
			`${API_Header.grn}/${grnId}/lines/${lineId}/qa`,
		bypass: (grnId: number, lineId: number) =>
			`${API_Header.grn}/${grnId}/lines/${lineId}/bypass`,
		correction: (grnId: number, lineId: number) =>
			`${API_Header.grn}/${grnId}/lines/${lineId}/correction`,
	},
	subcontracting: {
		list: `${API_Header.sco}/getscos`,
		detail: (scoId: number) => `${API_Header.sco}/getscodetails/${scoId}`,
		create: `${API_Header.sco}/createsco`,
		update: `${API_Header.sco}/updatesco`,
		submit: (scoId: number) => `${API_Header.sco}/${scoId}/submit`,
		cancel: (scoId: number) => `${API_Header.sco}/${scoId}/cancel`,
		challans: (scoId: number) => `${API_Header.sco}/${scoId}/challans`,
		openChallans: `${API_Header.sco}/challans/open`,
		challanDetail: (challanId: number) =>
			`${API_Header.sco}/challans/${challanId}`,
	},
	company: {
		settings: `${API_Header.company}/settings`,
	},
} as const;
