const API_Header = {
	auth: "/auth",
	setup: "/setup",
	approval: "/approval",
	supplier: "/supplier",
	asset: "/asset",
	pr: "/pr",
	po: "/po",
	grn: "/grn",
	purchaseReturn: "/purchase-return",
	stockTransfer: "/stock-transfer",
	sco: "/sco",
	bom: "/bom",
	customers: "/customers",
	saleOrders: "/sale-orders",
	reorder: "/reorder",
	company: "/company",
	supplierInvoice: "/supplier-invoice",
	rfq: "/rfq",
	rateContract: "/rate-contract",
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
			detail: (id: number) => `${API_Header.setup}/access-log/${id}`,
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
		itemsLastRates: `${API_Header.asset}/items/last-rates`,
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
			reconciliation: `${API_Header.asset}/inventory/reconciliation`,
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
	bom: {
		list: API_Header.bom,
		create: API_Header.bom,
		needs: `${API_Header.bom}/needs`,
		detail: (bomId: number) => `${API_Header.bom}/${bomId}`,
		update: (bomId: number) => `${API_Header.bom}/${bomId}`,
		remove: (bomId: number) => `${API_Header.bom}/${bomId}`,
		tree: (bomId: number) => `${API_Header.bom}/${bomId}/tree`,
		changeSummary: (bomId: number) =>
			`${API_Header.bom}/${bomId}/change-summary`,
		release: (bomId: number) => `${API_Header.bom}/${bomId}/release`,
		retire: (bomId: number) => `${API_Header.bom}/${bomId}/retire`,
		whereUsed: (itemId: number) =>
			`${API_Header.bom}/items/${itemId}/where-used`,
		history: (partId: number) => `${API_Header.bom}/parts/${partId}/history`,
		startRevision: (partId: number) =>
			`${API_Header.bom}/parts/${partId}/revisions`,
	},
	customers: {
		list: API_Header.customers,
		create: API_Header.customers,
		detail: (customerId: number) => `${API_Header.customers}/${customerId}`,
		update: (customerId: number) => `${API_Header.customers}/${customerId}`,
	},
	reorder: {
		items: `${API_Header.reorder}/items`,
		runs: `${API_Header.reorder}/runs`,
		runDetail: (runId: number) => `${API_Header.reorder}/runs/${runId}`,
		checkNow: `${API_Header.reorder}/check-now`,
		settings: `${API_Header.reorder}/settings`,
		ownerCandidates: `${API_Header.reorder}/owner-candidates`,
	},
	saleOrders: {
		list: API_Header.saleOrders,
		create: API_Header.saleOrders,
		detail: (soId: number) => `${API_Header.saleOrders}/${soId}`,
		update: (soId: number) => `${API_Header.saleOrders}/${soId}`,
		confirm: (soId: number) => `${API_Header.saleOrders}/${soId}/confirm`,
		hold: (soId: number) => `${API_Header.saleOrders}/${soId}/hold`,
		resume: (soId: number) => `${API_Header.saleOrders}/${soId}/resume`,
		close: (soId: number) => `${API_Header.saleOrders}/${soId}/close`,
		cancel: (soId: number) => `${API_Header.saleOrders}/${soId}/cancel`,
		audit: (soId: number) => `${API_Header.saleOrders}/${soId}/audit`,
		explosions: (soId: number) => `${API_Header.saleOrders}/${soId}/explosions`,
		explosion: (soId: number, eid: number) =>
			`${API_Header.saleOrders}/${soId}/explosions/${eid}`,
		explosionRows: (soId: number, eid: number) =>
			`${API_Header.saleOrders}/${soId}/explosions/${eid}/rows`,
		explosionDrafts: (soId: number, eid: number) =>
			`${API_Header.saleOrders}/${soId}/explosions/${eid}/drafts`,
	},
	purchaseReturns: {
		list: `${API_Header.purchaseReturn}/getreturns`,
		awaiting: `${API_Header.purchaseReturn}/awaiting`,
		detail: (id: number) =>
			`${API_Header.purchaseReturn}/getreturndetails/${id}`,
		prefill: (grnId: number) => `${API_Header.purchaseReturn}/prefill/${grnId}`,
		create: `${API_Header.purchaseReturn}/createreturn`,
		update: `${API_Header.purchaseReturn}/updatereturn`,
		cancelDraft: (id: number) =>
			`${API_Header.purchaseReturn}/${id}/cancel-draft`,
		post: (id: number) => `${API_Header.purchaseReturn}/${id}/post`,
		cancel: (id: number) => `${API_Header.purchaseReturn}/${id}/cancel`,
	},
	stockTransfers: {
		list: API_Header.stockTransfer,
		detail: (id: number) => `${API_Header.stockTransfer}/${id}`,
		create: API_Header.stockTransfer,
		update: (id: number) => `${API_Header.stockTransfer}/${id}`,
		cancel: (id: number) => `${API_Header.stockTransfer}/${id}/cancel`,
		post: (id: number) => `${API_Header.stockTransfer}/${id}/post`,
		reverse: (id: number) => `${API_Header.stockTransfer}/${id}/reverse`,
	},
	subcontracting: {
		list: `${API_Header.sco}/getscos`,
		detail: (scoId: number) => `${API_Header.sco}/getscodetails/${scoId}`,
		create: `${API_Header.sco}/createsco`,
		update: `${API_Header.sco}/updatesco`,
		submit: (scoId: number) => `${API_Header.sco}/${scoId}/submit`,
		cancel: (scoId: number) => `${API_Header.sco}/${scoId}/cancel`,
		close: (scoId: number) => `${API_Header.sco}/${scoId}/close`,
		vendorStock: `${API_Header.sco}/reports/vendor-stock`,
		lossLog: `${API_Header.sco}/reports/loss-log`,
		challans: (scoId: number) => `${API_Header.sco}/${scoId}/challans`,
		receipts: (scoId: number) => `${API_Header.sco}/${scoId}/receipts`,
		receiptDetail: (receiptId: number) =>
			`${API_Header.sco}/receipts/${receiptId}`,
		receiptQa: (receiptId: number, lineId: number) =>
			`${API_Header.sco}/receipts/${receiptId}/lines/${lineId}/qa`,
		openChallans: `${API_Header.sco}/challans/open`,
		challanDetail: (challanId: number) =>
			`${API_Header.sco}/challans/${challanId}`,
	},
	supplierInvoices: {
		list: `${API_Header.supplierInvoice}/getsupplierinvoices`,
		billableLines: `${API_Header.supplierInvoice}/getbillablelines`,
		detail: (id: number) =>
			`${API_Header.supplierInvoice}/getsupplierinvoicedetails/${id}`,
		create: `${API_Header.supplierInvoice}/createsupplierinvoice`,
		update: `${API_Header.supplierInvoice}/updatesupplierinvoice`,
		remove: (id: number) =>
			`${API_Header.supplierInvoice}/deletesupplierinvoice/${id}`,
		submit: (id: number) => `${API_Header.supplierInvoice}/${id}/submit`,
		backToDraft: (id: number) =>
			`${API_Header.supplierInvoice}/${id}/back-to-draft`,
		release: (id: number) => `${API_Header.supplierInvoice}/${id}/release`,
		cancel: (id: number) => `${API_Header.supplierInvoice}/${id}/cancel`,
	},
	rfq: {
		prLines: `${API_Header.rfq}/pr-lines`,
		list: `${API_Header.rfq}/getrfqs`,
		detail: (id: number) => `${API_Header.rfq}/getrfqdetails/${id}`,
		create: `${API_Header.rfq}/createrfq`,
		update: `${API_Header.rfq}/updaterfq`,
		send: (id: number) => `${API_Header.rfq}/${id}/send`,
		cancel: (id: number) => `${API_Header.rfq}/${id}/cancel`,
		close: (id: number) => `${API_Header.rfq}/${id}/close`,
		print: (id: number) => `${API_Header.rfq}/${id}/print`,
		comparison: (id: number) => `${API_Header.rfq}/${id}/comparison`,
		award: (id: number) => `${API_Header.rfq}/${id}/award`,
		createQuote: (id: number) => `${API_Header.rfq}/${id}/quotes`,
		quote: (quoteId: number) => `${API_Header.rfq}/quotes/${quoteId}`,
		submitQuote: (quoteId: number) =>
			`${API_Header.rfq}/quotes/${quoteId}/submit`,
		cancelQuote: (quoteId: number) =>
			`${API_Header.rfq}/quotes/${quoteId}/cancel`,
	},
	rateContracts: {
		list: `${API_Header.rateContract}/getcontracts`,
		detail: (id: number) =>
			`${API_Header.rateContract}/getcontractdetails/${id}`,
		create: `${API_Header.rateContract}/createcontract`,
		update: `${API_Header.rateContract}/updatecontract`,
		activate: (id: number) => `${API_Header.rateContract}/${id}/activate`,
		terminate: (id: number) => `${API_Header.rateContract}/${id}/terminate`,
		cancel: (id: number) => `${API_Header.rateContract}/${id}/cancel`,
	},
	company: {
		invoiceTolerances: `${API_Header.company}/invoice-tolerances`,
		settings: `${API_Header.company}/settings`,
		settingsHistory: `${API_Header.company}/settings/history`,
	},
} as const;
